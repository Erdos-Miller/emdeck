import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'sidebarWidth'
  | 'terminalPanel'
  | 'terminalHeight'
  | 'workspaceArea'
  | 'setSidebarWidth'
  | 'setTerminalHeight'
>;
export function useLayoutActions({
  sidebarWidth,
  terminalPanel,
  terminalHeight,
  workspaceArea,
  setSidebarWidth,
  setTerminalHeight,
}: Dependencies) {
  const panelSize = (axis: 'sidebar' | 'terminal') =>
    axis === 'sidebar'
      ? sidebarWidth
      : (terminalPanel.current?.getBoundingClientRect().height ?? terminalHeight);
  const maximumPanelSize = (axis: 'sidebar' | 'terminal') =>
    axis === 'sidebar'
      ? 440
      : Math.max(180, (workspaceArea.current?.clientHeight ?? window.innerHeight - 90) - 160);
  const changePanelSize = (axis: 'sidebar' | 'terminal', value: number) => {
    if (axis === 'sidebar') setSidebarWidth(Math.min(440, Math.max(190, value)));
    else setTerminalHeight(Math.max(180, Math.min(maximumPanelSize(axis), value)));
  };
  const resizeKey = (axis: 'sidebar' | 'terminal', event: React.KeyboardEvent) => {
    const keys = axis === 'sidebar' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowDown', 'ArrowUp'];
    if (![...keys, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    changePanelSize(
      axis,
      event.key === 'Home'
        ? axis === 'sidebar'
          ? 190
          : 180
        : event.key === 'End'
          ? maximumPanelSize(axis)
          : panelSize(axis) + (event.key === keys[0] ? -20 : 20)
    );
  };
  const resize = (axis: 'sidebar' | 'terminal', e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const x = e.clientX,
      y = e.clientY,
      start = panelSize(axis);
    const move = (event: PointerEvent) =>
      changePanelSize(axis, start + (axis === 'sidebar' ? event.clientX - x : y - event.clientY));
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
    document.addEventListener('pointercancel', stop, { once: true });
    window.addEventListener('blur', stop, { once: true });
  };
  return { panelSize, maximumPanelSize, changePanelSize, resizeKey, resize };
}
