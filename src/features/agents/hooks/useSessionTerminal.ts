import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionCall } from '../../../platform/desktop/sessions';
import type { SessionRead } from '../../../shared/contracts/sessions';
import type { AgentCommand, PaneState, Settings } from '../../../shared/contracts/workspace';
import { useLatest } from '../../../shared/hooks/useLatest';
import { bindTerminalAttachments } from '../lib/terminalAttachments';
import { bindTerminalKeyboard } from '../lib/terminalKeyboard';
import { terminalFont } from '../lib/terminal-font';
import { terminalInput } from '../services/session-model';
import { createTerminalFitter } from '../services/terminal-fit';

const CHUNK_BYTES = 32 * 1024;
const OUTPUT_DECAY_MS = 1400;
const leases = new Map<string, () => Promise<unknown>>();

/** Release every held lease so a reopened window reattaches without an explicit takeover. */
export const releasePaneLeases = () =>
  Promise.all([...leases.values()].map(release => release().catch(() => {})));
interface Options {
  connection: string | null;
  id: string;
  generation: string;
  settings: Settings;
  theme: NonNullable<Terminal['options']['theme']>;
  attachmentMessage?: string;
  onState?: (state: PaneState) => void;
  onCommand?: (command: AgentCommand) => void;
  onExit?: (code: number | null) => void;
  onError?: (error: unknown) => void;
  onOutput?: (term: Terminal) => void;
  setup?: (term: Terminal) => (() => void) | undefined;
}

/** One attached view of a session-server pane: its screen, lease, input and commands. */
export function useSessionTerminal({
  connection,
  id,
  generation,
  settings,
  theme,
  attachmentMessage,
  onState,
  onCommand,
  onExit,
  onError,
  onOutput,
  setup,
}: Options) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const refit = useRef<(() => void) | null>(null);
  const [error, setError] = useState('');
  const [takeover, setTakeover] = useState(0);
  const takeControl = useCallback(() => setTakeover(value => value + 1), []);
  const appearance = useLatest({ settings, theme });
  const callbacks = useLatest({ onState, onCommand, onExit, onError, onOutput, setup });

  useEffect(() => {
    if (!host.current) return;
    const link = connection;
    const linked = () => {
      if (!link) throw new Error('This terminal is not connected to a session server.');
      return link;
    };
    const { settings, theme } = appearance.current;
    let disposed = false;
    let owned = false;
    let activity: ReturnType<typeof setTimeout> | undefined;
    let live: PaneState | undefined;
    const client = crypto.randomUUID();
    const leaseKey = `${id}:${client}`;
    if (link) leases.set(leaseKey, () => sessionCall(link, 'pane.detach', { id, client }));
    const state = (next: PaneState) => {
      if (!disposed && next !== live) {
        live = next;
        callbacks.current.onState?.(next);
      }
    };
    const report = (value: unknown) => {
      if (disposed) return;
      owned = false;
      setError(String(value));
      state('error');
      callbacks.current.onError?.(value);
    };
    // A refused attachment or keyboard action leaves the pane and its lease intact.
    const complain = (value: unknown) => {
      if (!disposed) callbacks.current.onError?.(value);
    };
    const term = new Terminal({
      cursorBlink: false,
      fontFamily: terminalFont(settings.terminalFontFamily),
      fontSize: settings.terminalFontSize,
      lineHeight: settings.terminalLineHeight,
      scrollback: settings.scrollback,
      allowProposedApi: false,
      theme,
      convertEol: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    terminal.current = term;
    const fitter = createTerminalFitter(term, () => fit.fit(), {
      request: callback => requestAnimationFrame(callback),
      cancel: handle => cancelAnimationFrame(handle),
    });
    const resize = () => {
      if (disposed || !host.current?.clientWidth || !host.current.clientHeight) return;
      fitter.fit();
      if (owned && link)
        void sessionCall(link, 'pane.resize', {
          id,
          client,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
    };
    refit.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    // The server drops an idle lease after 45 seconds; this also keeps it held.
    const heartbeat = setInterval(resize, 15000);
    const element = host.current;
    element.addEventListener('wheel', fitter.cancel, { capture: true, passive: true });
    element.addEventListener('pointerdown', fitter.cancel, true);
    element.addEventListener('keydown', fitter.cancel, true);
    element.addEventListener('touchstart', fitter.cancel, { capture: true, passive: true });
    const attached = () => (owned ? id : null);
    const detachAttachments = bindTerminalAttachments(element, term, {
      id: attached,
      unavailable: attachmentMessage,
      upload: async (name, data) => {
        for (let offset = 0; offset < data.length; offset += CHUNK_BYTES) {
          const slice = data.subarray(offset, Math.min(offset + CHUNK_BYTES, data.length));
          const result = await sessionCall(linked(), 'pane.attachment', {
            id,
            client,
            name,
            data: encode(slice),
            offset,
            total: data.length,
          });
          if (result.input) return result.input;
        }
        throw new Error('The session server did not accept the whole attachment.');
      },
      paths: async paths =>
        (await sessionCall(linked(), 'pane.paths', { id, client, paths })).input,
      onError: complain,
    });
    bindTerminalKeyboard(term, complain);
    const extra = callbacks.current.setup?.(term);
    let queue = Promise.resolve();
    const input = term.onData(data => {
      const text = terminalInput(data);
      if (!owned || !text) return;
      queue = queue
        .then(async () => {
          if (!disposed && owned) await sessionCall(linked(), 'pane.input', { id, client, text });
        })
        .catch(report);
    });
    const start = async () => {
      setError('');
      state('starting');
      try {
        await sessionCall(linked(), 'pane.attach', { id, client, takeover: takeover > 0 });
        if (disposed) return;
        owned = true;
        resize();
        let after: number | null = null;
        let commandsAfter: number | null = null;
        while (!disposed) {
          const result: SessionRead = await sessionCall(linked(), 'pane.read', {
            id,
            after,
            wait_ms: 20000,
            commands_after: commandsAfter,
          });
          if (disposed) break;
          if (result.reset) term.reset();
          const bytes = decode(result.data);
          if (bytes.length) {
            await new Promise<void>(resolve => term.write(bytes, resolve));
            callbacks.current.onOutput?.(term);
            state('output');
            clearTimeout(activity);
            activity = setTimeout(() => state('running'), OUTPUT_DECAY_MS);
          } else if (live !== 'output') state('running');
          after = result.sequence;
          commandsAfter = result.commandSequence;
          for (const command of result.commands) callbacks.current.onCommand?.(command);
          if (!result.pane.running) {
            owned = false;
            clearTimeout(activity);
            state('exited');
            callbacks.current.onExit?.(result.pane.exitCode);
            break;
          }
        }
      } catch (value) {
        report(value);
      }
    };
    if (link) void start();
    return () => {
      disposed = true;
      owned = false;
      leases.delete(leaseKey);
      clearTimeout(activity);
      clearInterval(heartbeat);
      observer.disconnect();
      element.removeEventListener('wheel', fitter.cancel, true);
      element.removeEventListener('pointerdown', fitter.cancel, true);
      element.removeEventListener('keydown', fitter.cancel, true);
      element.removeEventListener('touchstart', fitter.cancel, true);
      input.dispose();
      extra?.();
      detachAttachments();
      fitter.dispose();
      term.dispose();
      terminal.current = null;
      refit.current = null;
      if (link) void sessionCall(link, 'pane.detach', { id, client }).catch(() => {});
    };
  }, [connection, id, generation, takeover, appearance, callbacks, attachmentMessage]);

  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    term.options.theme = theme;
    term.options.fontFamily = terminalFont(settings.terminalFontFamily);
    term.options.fontSize = settings.terminalFontSize;
    term.options.lineHeight = settings.terminalLineHeight;
    term.options.scrollback = settings.scrollback;
    refit.current?.();
  }, [
    theme,
    settings.terminalFontFamily,
    settings.terminalFontSize,
    settings.terminalLineHeight,
    settings.scrollback,
  ]);

  return { host, terminal, error, takeControl };
}

const decode = (value: string) =>
  Uint8Array.from(atob(value), character => character.charCodeAt(0));
const encode = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
