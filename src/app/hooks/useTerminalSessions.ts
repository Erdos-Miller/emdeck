import { useState } from 'react';
import { useSessionDesk } from '../../features/agents/hooks/useSessionDesk';
import { useTerminalWorkspace } from '../../features/agents/hooks/useTerminalWorkspace';
import { useSessionVisibility } from '../../features/agents/hooks/useSessionVisibility';
import { backgroundSpaces } from '../../features/agents/services/background-workspaces';
import { paneName, sessionName } from '../../features/agents/services/terminal-title';
import type { BackgroundSession } from '../../features/agents/services/background-workspaces';
import type { WorkspaceController } from './useWorkspace';

export const useTerminalSessions = (
  model: Pick<
    WorkspaceController,
    'panes' | 'project' | 'addPane' | 'focusAgent' | 'setMaxPane' | 'fail'
  >
) => {
  const [manageBackground, setManageBackground] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [maxBackground, setMaxBackground] = useState<string | null>(null);
  const [backgroundFocus, setBackgroundFocus] = useState({ key: '', sequence: 0 });
  const [backgroundActive, setBackgroundActive] = useState(false);
  const background = useSessionDesk(backgroundActive);
  const visibility = useSessionVisibility(model.project?.root);
  const clearMaximized = () => {
    model.setMaxPane(null);
    setMaxBackground(null);
  };
  const focus = (id: string, solo?: boolean) => {
    visibility.show([`terminal:${id}`]);
    setSelectedBackground(null);
    setMaxBackground(null);
    model.focusAgent(id, solo);
  };
  const workspace = useTerminalWorkspace({
    panes: model.panes,
    projectName: model.project?.name ?? 'No project',
    addPane: model.addPane,
    focus,
    clearMaximized,
    fail: model.fail,
    extraSpaces: backgroundSpaces(background.sessions),
  });
  // Activating a session view is explicit. Neither opening a project nor the
  // ordinary Panes view should start a connection or a background agent.
  const active = workspace.view !== 'panes';
  if (active && !backgroundActive) setBackgroundActive(true);
  const selectBackground = (session: BackgroundSession) => {
    if (!background.attach(session.machine, session.pane)) return;
    visibility.show([session.key]);
    // Focus may reveal another workspace, but must not narrow a mixed split.
    workspace.selectSpace(workspace.activeSpace === session.space ? session.space : 'all');
    setSelectedBackground(session.key);
    setMaxBackground(session.key);
    setBackgroundFocus(previous => ({ key: session.key, sequence: previous.sequence + 1 }));
  };
  const detachBackground = (key: string) => {
    background.detach(key);
    visibility.show([key]);
    if (maxBackground === key) setMaxBackground(null);
    if (selectedBackground === key) setSelectedBackground(null);
  };
  const hideSession = (key: string) => {
    visibility.hide(key);
    clearMaximized();
    background.setSolo(null);
    if (selectedBackground === key) setSelectedBackground(null);
  };
  const showSessions = (keys: string[]) => {
    visibility.show(keys);
    workspace.selectSpace('all');
    background.selectSpace('all');
    if (
      (workspace.view === 'panes' && keys.some(key => !key.startsWith('terminal:'))) ||
      (workspace.view === 'server' && keys.some(key => key.startsWith('terminal:')))
    )
      workspace.setView('workspaces');
  };
  return {
    ...workspace,
    visiblePanes: workspace.visiblePanes.filter(
      pane => !visibility.hidden.has(`terminal:${pane.id}`)
    ),
    listedPanes: model.panes.filter(pane => !visibility.hidden.has(`terminal:${pane.id}`)),
    listedBackground: background.sessions.filter(session => !visibility.hidden.has(session.key)),
    hiddenSessions: visibility.hidden,
    hiddenItems: [
      ...model.panes.flatMap(pane =>
        visibility.hidden.has(`terminal:${pane.id}`)
          ? [
              {
                key: `terminal:${pane.id}`,
                name: paneName(pane),
                detail:
                  pane.remote?.target.host ?? (pane.cwd || model.project?.name || 'Local terminal'),
              },
            ]
          : []
      ),
      ...background.tiles.flatMap(session =>
        visibility.hidden.has(session.key)
          ? [
              {
                key: session.key,
                name: sessionName(session.pane),
                detail: `${session.machine.profile.name} · ${session.workspace}`,
              },
            ]
          : []
      ),
    ],
    hideSession,
    showSessions,
    background,
    manageBackground,
    setManageBackground,
    selectedBackground: background.attachedKeys.has(selectedBackground ?? '')
      ? selectedBackground
      : null,
    setSelectedBackground,
    maxBackground:
      background.attachedKeys.has(maxBackground ?? '') &&
      background.tiles.some(session => session.key === maxBackground)
        ? maxBackground
        : null,
    setMaxBackground,
    backgroundFocus,
    selectBackground,
    detachBackground,
    clearMaximized,
  };
};
export type TerminalSessions = ReturnType<typeof useTerminalSessions>;
