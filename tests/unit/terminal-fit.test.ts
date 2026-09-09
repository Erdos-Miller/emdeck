import { describe, expect, it, vi } from 'vitest';
import { createTerminalFitter } from '../../src/features/agents/services/terminal-fit';

const fixture = (position = 100) => {
  const active = { baseY: 100, viewportY: position };
  const terminal = {
    buffer: { active },
    scrollToBottom: vi.fn(() => {
      active.viewportY = active.baseY;
    }),
  };
  const callbacks = new Map<number, () => void>();
  let next = 0;
  const fit = vi.fn(() => {
    active.viewportY = 0;
  });
  const fitter = createTerminalFitter(terminal, fit, {
    request: callback => {
      callbacks.set(++next, callback);
      return next;
    },
    cancel: id => {
      callbacks.delete(id);
    },
  });
  const flush = () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback());
  };
  return { active, terminal, fitter, callbacks, flush, fit };
};

describe('terminal fitting', () => {
  it('keeps following output after the resized DOM clamps the viewport', () => {
    const state = fixture();
    state.fitter.fit();
    state.active.baseY = 110;
    state.flush();
    expect(state.active.viewportY).toBe(110);
  });
  it('does not jump from scrollback to the latest output', () => {
    const state = fixture(20);
    state.fitter.fit();
    state.flush();
    expect(state.terminal.scrollToBottom).not.toHaveBeenCalled();
  });
  it('coalesces rapid resizes without losing the original follow position', () => {
    const state = fixture();
    state.fitter.fit();
    state.fitter.fit();
    expect(state.callbacks.size).toBe(1);
    state.flush();
    expect(state.terminal.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(state.active.viewportY).toBe(100);
  });
  it('lets user scrolling cancel a pending restore and stops after disposal', () => {
    const state = fixture();
    state.fitter.fit();
    state.fitter.cancel();
    state.flush();
    expect(state.terminal.scrollToBottom).not.toHaveBeenCalled();
    state.fitter.dispose();
    state.fitter.fit();
    expect(state.fit).toHaveBeenCalledTimes(1);
    expect(state.callbacks.size).toBe(0);
  });
});
