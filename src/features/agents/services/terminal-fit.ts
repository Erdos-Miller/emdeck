interface Viewport {
  buffer: { readonly active: { readonly viewportY: number; readonly baseY: number } };
  scrollToBottom: () => void;
}
interface Frames {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
}

export const createTerminalFitter = (terminal: Viewport, fit: () => void, frames: Frames) => {
  let pending: number | null = null;
  let following = false;
  let disposed = false;
  const cancel = () => {
    if (pending !== null) frames.cancel(pending);
    pending = null;
    following = false;
  };
  return {
    fit: () => {
      if (disposed) return;
      const buffer = terminal.buffer.active;
      const keepFollowing = following || buffer.viewportY === buffer.baseY;
      cancel();
      fit();
      if (!keepFollowing) return;
      following = true;
      // The viewport must follow xterm's screen height (not the host's height)
      // so browser clamping cannot happen before this snapshot. Restore after
      // xterm synchronizes its DOM scroll area on the next frame.
      pending = frames.request(() => {
        pending = null;
        following = false;
        if (!disposed) terminal.scrollToBottom();
      });
    },
    cancel,
    dispose: () => {
      disposed = true;
      cancel();
    },
  };
};
