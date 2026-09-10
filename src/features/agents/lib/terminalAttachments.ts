import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { Terminal } from '@xterm/xterm';
import { call, native } from '../../../platform/desktop/api';
import { validateAttachments } from '../services/attachments';

interface Options {
  id: () => string | null;
  unavailable?: string;
  onError: (error: unknown) => void;
}

/** Own listeners with the xterm instance, never with appearance or title updates. */
export const bindTerminalAttachments = (host: HTMLElement, term: Terminal, options: Options) => {
  const target = host.closest<HTMLElement>('.terminal-pane') ?? host;
  let disposed = false;
  let queue = Promise.resolve();
  const id = () => {
    if (options.unavailable) throw new Error(options.unavailable);
    if (!native) throw new Error('File attachments require the Emdeck desktop app.');
    const id = options.id();
    if (!id) throw new Error('Wait for the terminal to connect before attaching files.');
    return id;
  };
  const enqueue = (prepare: (id: string) => Promise<string>) => {
    term.focus();
    queue = queue
      .then(async () => {
        if (disposed) return;
        const session = id();
        target.dataset.attachmentBusy = 'true';
        try {
          const input = await prepare(session);
          if (!disposed && options.id() === session) term.paste(input);
        } finally {
          delete target.dataset.attachmentBusy;
        }
      })
      .catch(error => {
        if (!disposed) options.onError(error);
      });
  };
  const files = (files: File[]) =>
    enqueue(async id => {
      validateAttachments(files);
      const paths: string[] = [];
      for (const file of files) {
        if (disposed) return '';
        const data = Array.from(new Uint8Array(await file.arrayBuffer()));
        paths.push(
          await call('terminal_attachment', { id, name: file.name || 'clipboard.png', data })
        );
      }
      return paths.join('');
    });
  const paste = (event: ClipboardEvent) => {
    const attachments = Array.from(event.clipboardData?.files ?? []);
    if (!attachments.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    files(attachments);
  };
  const dragOver = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    target.dataset.attachmentDrop = 'true';
  };
  const leave = (event: DragEvent) => {
    if (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget))
      delete target.dataset.attachmentDrop;
  };
  const drop = (event: DragEvent) => {
    const attachments = Array.from(event.dataTransfer?.files ?? []);
    if (!attachments.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    delete target.dataset.attachmentDrop;
    files(attachments);
  };
  target.addEventListener('paste', paste, true);
  target.addEventListener('dragover', dragOver);
  target.addEventListener('dragleave', leave);
  target.addEventListener('drop', drop, true);
  const unlisten = native
    ? getCurrentWebview().onDragDropEvent(event => {
        if (disposed) return;
        delete target.dataset.attachmentDrop;
        const data = event.payload;
        if (data.type === 'leave') return;
        const hit = document.elementFromPoint(
          data.position.x / window.devicePixelRatio,
          data.position.y / window.devicePixelRatio
        );
        if (!hit || !target.contains(hit)) return;
        if (data.type === 'drop') {
          enqueue(id => call('terminal_path_input', { id, paths: data.paths }));
        } else target.dataset.attachmentDrop = 'true';
      })
    : Promise.resolve(() => {});
  void unlisten.catch(error => {
    if (!disposed) options.onError(error);
  });
  return () => {
    disposed = true;
    delete target.dataset.attachmentDrop;
    delete target.dataset.attachmentBusy;
    target.removeEventListener('paste', paste, true);
    target.removeEventListener('dragover', dragOver);
    target.removeEventListener('dragleave', leave);
    target.removeEventListener('drop', drop, true);
    void unlisten.then(dispose => dispose()).catch(() => {});
  };
};
