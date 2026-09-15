import type { Terminal } from '@xterm/xterm';
import { Copy, Maximize2, Minimize2, RotateCcw, TerminalSquare, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { native } from '../../../platform/desktop/api';
import { findPaths, linkRange } from '../services/terminalLinks';
import type {
  AgentCommand,
  AgentObservation,
  Pane,
  PaneState,
  Settings,
} from '../../../shared/contracts/workspace';
import { useLatest } from '../../../shared/hooks/useLatest';
import { agentKind, agentStatus, inspectAgentScreen } from '../lib/agents';
import { useSessionTerminal } from '../hooks/useSessionTerminal';
import { remoteStatus } from '../services/connections';
import { paneName } from '../services/terminal-title';
import { createAgentActivityTracker } from '../services/agent-activity-tracker';
import { readAgentScreen } from '../services/agent-screen';
interface Props {
  pane: Pane;
  connection: string | null;
  settings: Settings;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
  onRestart: () => void;
  onState: (id: string, state: PaneState) => void;
  onTitle: (id: string, title: string) => void;
  onError: (error: unknown) => void;
  onObservation: (id: string, observation: AgentObservation | null) => void;
  onCommand: (id: string, command: AgentCommand) => void;
  focusRequest: number;
  selected: boolean;
  onFocus: () => void;
}
export default function TerminalPane({
  pane,
  connection,
  settings,
  maximized,
  onMaximize,
  onClose,
  onRestart,
  onState,
  onTitle,
  onError,
  onObservation,
  onCommand,
  focusRequest,
  selected,
  onFocus,
}: Props) {
  const [state, setState] = useState<PaneState>(native ? 'starting' : 'preview');
  const [observation, setObservation] = useState<AgentObservation | undefined>();
  const callbacks = useLatest({ onState, onTitle, onError, onObservation, onCommand });
  const inspection = useRef({
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    key: '',
  });
  const theme = useMemo(() => terminalTheme(settings.theme), [settings.theme]);
  const kind = agentKind(pane.command);
  // A restart is a new process; its evidence must not carry across generations.
  const trackerKey = `${kind}:${pane.generation}`;
  const tracker = useRef({ key: trackerKey, value: createAgentActivityTracker(kind) });
  if (tracker.current.key !== trackerKey)
    tracker.current = { key: trackerKey, value: createAgentActivityTracker(kind) };
  const activity = tracker.current.value;
  const publish = (next: AgentObservation) => {
    const key = JSON.stringify([next.activity, next.contextPercent, next.model]);
    if (key !== inspection.current.key) {
      inspection.current.key = key;
      setObservation(next);
      callbacks.current.onObservation(pane.id, next);
    }
  };
  const screen = (term: Terminal) =>
    readAgentScreen(term.buffer.active, term.rows, kind === 'codex');
  const inspect = (term: Terminal) => {
    if (inspection.current.timer || kind === 'shell') return;
    inspection.current.timer = setTimeout(() => {
      inspection.current.timer = undefined;
      const lines = screen(term);
      publish({ ...inspectAgentScreen(kind, lines), activity: activity.inspect(lines) });
    }, 350);
  };
  const { host, terminal, error, takeControl } = useSessionTerminal({
    connection,
    id: pane.id,
    generation: pane.generation,
    settings,
    theme,
    attachmentMessage: pane.remote
      ? 'Transfer the file to the remote machine, then paste its remote path. Emdeck does not upload dropped files through a remote shell pane.'
      : undefined,
    onState: next => {
      setState(next);
      callbacks.current.onState(pane.id, next);
    },
    onCommand: command => callbacks.current.onCommand(pane.id, command),
    onError: error => callbacks.current.onError(error),
    onOutput: inspect,
    onExit: code =>
      terminal.current?.writeln(
        `\r\n\x1b[90m[${pane.remote ? 'SSH disconnected' : 'Process exited'}${code === null ? '' : ` with code ${code}`} · ${pane.remote ? 'reconnect to attach again' : 'restart to run again'}]\x1b[0m`
      ),
    setup: term => {
      // The attached view parses OSC titles exactly; the server's title serves detached clients.
      const title = term.onTitleChange(value => {
        activity.title(value);
        callbacks.current.onTitle(pane.id, value);
      });
      const typing = term.onData(data => {
        if (kind === 'shell') return;
        const lines = screen(term);
        publish({ ...inspectAgentScreen(kind, lines), activity: activity.input(data) });
      });
      const stop = () => {
        title.dispose();
        typing.dispose();
      };
      if (!native) {
        term.writeln(`\x1b[32m  ${pane.name}\x1b[0m  \x1b[90m/ browser preview\x1b[0m\r\n`);
        term.writeln(
          `  ${pane.command ? `Launch command: ${pane.command}` : 'Your system shell, in your project folder.'}\r\n`
        );
        term.writeln('  Open Emdeck desktop to start a real session.');
        term.writeln('  Installed CLIs run directly in this pane.\r\n');
        term.writeln('  \x1b[90mNo agent is running in this preview.\x1b[0m');
        return stop;
      }
      // Remote output names remote files; a local search would open the wrong one.
      if (pane.remote) return stop;
      const links = term.registerLinkProvider({
        provideLinks(row, callback) {
          const buffer = term.buffer.active;
          let first = row;
          while (first > 1 && buffer.getLine(first - 1)?.isWrapped) first--;
          // Untrimmed rows keep every row exactly one width wide, so offsets stay divisible.
          let text = buffer.getLine(first - 1)?.translateToString(false) ?? '';
          for (let next = first + 1; buffer.getLine(next - 1)?.isWrapped; next++)
            text += buffer.getLine(next - 1)?.translateToString(false) ?? '';
          callback(
            findPaths(text).map(match => ({
              range: linkRange(match, first, term.cols),
              text: text.slice(match.start, match.end),
              activate: (event: MouseEvent) => {
                if (!event.ctrlKey && !event.metaKey) return;
                callbacks.current.onCommand(pane.id, {
                  op: 'openFile',
                  path: match.path,
                  line: match.line,
                  column: match.column,
                });
              },
            }))
          );
        },
      });
      return () => {
        links.dispose();
        stop();
      };
    },
  });
  useEffect(() => {
    const pending = inspection.current;
    return () => clearTimeout(pending.timer);
  }, []);
  useEffect(() => {
    inspection.current.key = '';
    setObservation(undefined);
    callbacks.current.onObservation(pane.id, null);
  }, [pane.id, pane.generation, callbacks]);
  useEffect(() => {
    if (focusRequest)
      requestAnimationFrame(() => {
        host.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        terminal.current?.focus();
      });
  }, [focusRequest, host, terminal]);
  const handleCopySelectedTerminalTextClick = () =>
    void navigator.clipboard.writeText(terminal.current?.getSelection() ?? '').catch(onError);
  return (
    <section
      className={`terminal-pane ${maximized ? 'maximized' : ''} ${selected ? 'selected-agent' : ''}`}
      aria-label={`${paneName(pane)} terminal`}
      onFocusCapture={onFocus}
    >
      <header className='pane-header'>
        <span className='pane-icon' style={{ color: pane.color }}>
          <TerminalSquare size={13} />
        </span>
        <strong title={paneName(pane)}>{paneName(pane)}</strong>
        <span
          className={`pane-state ${state}`}
          title='Agent activity is detected from the live terminal screen. Connected and Output describe the terminal connection only.'
        >
          <i />
          {pane.remote ? remoteStatus(state) : agentStatus(state, observation).label}
        </span>
        <span className='spacer' />
        <button
          className='icon-button'
          title='Copy selected terminal text'
          onClick={handleCopySelectedTerminalTextClick}
        >
          <Copy size={12} />
        </button>
        {(state === 'exited' || state === 'error') && (
          <button
            className='icon-button'
            title={pane.remote ? 'Reconnect remote session' : 'Restart terminal'}
            onClick={onRestart}
          >
            <RotateCcw size={12} />
          </button>
        )}
        <button
          className='icon-button'
          title={maximized ? 'Restore pane' : 'Maximize pane'}
          onClick={onMaximize}
        >
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          className='icon-button'
          title={`${pane.remote ? 'Disconnect' : 'Close'} ${paneName(pane)}`}
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </header>
      {error && (
        <div className='session-error' role='alert'>
          {error}
          <button onClick={takeControl}>Take control / retry</button>
        </div>
      )}
      <div className='terminal-host' ref={host} />
      <footer className='pane-footer'>
        <span>{pane.remote?.target.host ?? (pane.cwd ? `./${pane.cwd}` : './')}</span>
        <span>
          {pane.remote
            ? `${pane.remote.target.backend} · ${pane.remote.target.session || 'remote shell'}`
            : pane.command || settings.shell || 'system shell'}
        </span>
      </footer>
    </section>
  );
}
function terminalTheme(theme: Settings['theme']) {
  return theme === 'light'
    ? {
        background: '#fafbfc',
        foreground: '#343b48',
        cursor: '#456924',
        selectionBackground: '#dbeac9',
        black: '#20252c',
        red: '#bc3948',
        green: '#387737',
        yellow: '#8a660d',
        blue: '#356eb4',
        magenta: '#8752b5',
        cyan: '#247988',
        white: '#dfe4eb',
        brightBlack: '#788293',
      }
    : {
        background: '#111418',
        foreground: '#c5ccd6',
        cursor: '#b8ee86',
        selectionBackground: '#303f32',
        black: '#252b33',
        red: '#e78787',
        green: '#b8cf8b',
        yellow: '#dec48b',
        blue: '#8bbbd7',
        magenta: '#c5a1e9',
        cyan: '#83c5bf',
        white: '#e0e4ea',
        brightBlack: '#697384',
      };
}
