import { useCallback, useEffect, useRef } from 'react';
import { call, native } from '../../platform/desktop/api';
import { sessionCall } from '../../platform/desktop/sessions';
import { paneDirectory, relativeDirectory } from '../../features/agents/services/session-model';
import { releasePaneLeases } from '../../features/agents/hooks/useSessionTerminal';
import { paneName, terminalTitle } from '../../features/agents/services/terminal-title';
import type { SshProfile } from '../../shared/contracts/remote';
import type { AgentObservation, Pane, PaneState } from '../../shared/contracts/workspace';
import type { useWorkspaceState } from './useWorkspaceState';
const colors = ['#b8ee86', '#c4a0ed', '#8bbbf5', '#f1b17f', '#f38ea2'];
const MAX_PANES = 12;
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'project'
  | 'notify'
  | 'panes'
  | 'setPanes'
  | 'settings'
  | 'setTerminalVisible'
  | 'setMaxPane'
  | 'setAgentMenu'
  | 'ask'
  | 'paneStates'
  | 'confirm'
  | 'setAgentObservations'
  | 'setSelectedPane'
  | 'maxPane'
  | 'setPaneStates'
  | 'setPaneFocus'
  | 'agentPreferences'
  | 'runtime'
  | 'fail'
>;
export function useTerminalActions({
  project,
  notify,
  panes,
  setPanes,
  settings,
  setTerminalVisible,
  setMaxPane,
  setAgentMenu,
  ask,
  paneStates,
  confirm,
  setAgentObservations,
  setSelectedPane,
  maxPane,
  setPaneStates,
  setPaneFocus,
  agentPreferences,
  runtime,
  fail,
}: Dependencies) {
  const { connection, workspaceId, snapshot } = runtime;
  const launch = useRef({ project, settings, connection, workspaceId, claudeUsage: true });
  launch.current = {
    project,
    settings,
    connection,
    workspaceId,
    claudeUsage: agentPreferences.claudeUsage,
  };
  // A pane created here is not in the snapshot the poll loop is already holding.
  const unseen = useRef(new Set<string>());
  const forget = useCallback(
    (id: string) => {
      setPanes(ps => ps.filter(p => p.id !== id));
      setPaneStates(previous => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setAgentObservations(previous => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setSelectedPane(current => (current === id ? null : current));
      setMaxPane(current => (current === id ? null : current));
      unseen.current.delete(id);
    },
    [setPanes, setPaneStates, setAgentObservations, setSelectedPane, setMaxPane]
  );

  // The server owns pane identity. Adopt terminals this project left running and
  // drop views whose pane another client removed.
  useEffect(() => {
    if (!snapshot || !workspaceId) return;
    const live = snapshot.panes.filter(pane => pane.launch.workspaceId === workspaceId);
    const known = new Set(live.map(pane => pane.id));
    for (const id of known) unseen.current.delete(id);
    setPanes(previous => {
      const kept = previous.filter(pane => known.has(pane.id) || unseen.current.has(pane.id));
      const adopted: Pane[] = live
        .filter(pane => pane.running && !previous.some(item => item.id === pane.id))
        .slice(0, Math.max(0, MAX_PANES - kept.length))
        .map((pane, index) => ({
          id: pane.id,
          generation: pane.generation,
          name: pane.launch.name,
          command: pane.launch.command || pane.launch.args.join(' '),
          cwd: relativeDirectory(launch.current.project?.root ?? '', pane.launch.cwd),
          shell: pane.launch.shell,
          color: colors[(kept.length + index) % colors.length],
          startedAt: pane.startedAt * 1000,
          title: terminalTitle(pane.title ?? '') || undefined,
        }));
      const next = [...kept, ...adopted].map(pane => {
        const current = live.find(item => item.id === pane.id);
        return !current || pane.generation === current.generation
          ? pane
          : { ...pane, generation: current.generation };
      });
      return next.length === previous.length && next.every((p, i) => p === previous[i])
        ? previous
        : next;
    });
  }, [snapshot, workspaceId, setPanes]);

  const createPane = async (
    name: string,
    command: string,
    cwd: string,
    remote?: SshProfile,
    customName?: string
  ) => {
    const { project, settings, connection, workspaceId, claudeUsage } = launch.current;
    const created = await sessionCall(connection!, 'pane.create', {
      launch: {
        workspaceId: workspaceId!,
        name: customName ?? name,
        cwd: paneDirectory(project!.root, cwd),
        shell: settings.shell,
        command,
        resumeOnRestart: false,
        usageReporting: claudeUsage,
        args: remote ? await call('remote_session_args', { target: remote.target }) : [],
      },
      cols: 100,
      rows: 30,
    });
    unseen.current.add(created.id);
    setPanes(ps => {
      const view = {
        id: created.id,
        generation: created.generation,
        name,
        customName,
        command,
        cwd,
        shell: settings.shell,
        color: colors[ps.length % colors.length],
        startedAt: Date.now(),
        remote,
      };
      // A poll snapshot can adopt this pane first; its launch data has no custom name or SSH profile.
      const adopted = ps.findIndex(pane => pane.id === created.id);
      return adopted < 0
        ? [...ps, view]
        : ps.map((pane, index) => (index === adopted ? { ...view, color: pane.color } : pane));
    });
  };
  const addPane = (
    name: string,
    command = '',
    cwd = '',
    remote?: SshProfile,
    customName?: string
  ) => {
    if (!project) {
      notify('Open a project folder first.');
      return false;
    }
    if (native && (!connection || !workspaceId)) {
      notify(runtime.error || 'Connecting to the session server. Try again in a moment.', true);
      return false;
    }
    if (panes.length >= MAX_PANES) {
      notify(`Close a pane before opening another. You can have up to ${MAX_PANES} panes.`);
      return false;
    }
    if (native) void createPane(name, command, cwd, remote, customName).catch(fail);
    else addPreviewPane(name, command, cwd, customName);
    setTerminalVisible(true);
    setMaxPane(null);
    setAgentMenu(false);
    return true;
  };
  const addPreviewPane = (name: string, command: string, cwd: string, customName?: string) =>
    setPanes(ps => [
      ...ps,
      {
        id: crypto.randomUUID(),
        generation: 'preview',
        name,
        customName,
        command,
        cwd,
        shell: settings.shell,
        color: colors[ps.length % colors.length],
        startedAt: Date.now(),
      },
    ]);
  const customPane = async () => {
    setAgentMenu(false);
    const data = await ask({
      title: 'New terminal',
      description: 'Run any installed agent or shell command in a dedicated pane.',
      submit: 'Launch terminal',
      fields: [
        { name: 'name', label: 'Pane name', value: 'My agent' },
        {
          name: 'command',
          label: 'Command',
          placeholder: 'codex, claude, aider… (empty for shell)',
          optional: true,
        },
        {
          name: 'cwd',
          label: 'Working directory',
          placeholder: 'Relative to project root',
          optional: true,
        },
      ],
    });
    if (data) addPane(data.name, data.command, data.cwd, undefined, data.name);
  };
  const closePane = async (pane: Pane) => {
    const state = paneStates[pane.id];
    if (
      native &&
      state !== 'exited' &&
      state !== 'error' &&
      !(await confirm(
        `${pane.remote ? 'Disconnect' : 'Close'} ${paneName(pane)}?`,
        pane.remote
          ? pane.remote.target.backend === 'shell'
            ? 'Close this SSH connection. Processes in an ordinary remote shell may stop.'
            : 'Detach this SSH client. The existing remote multiplexer session keeps running.'
          : 'This will terminate the terminal session and its attached process.',
        pane.remote ? 'Disconnect' : 'Close terminal',
        true
      ))
    )
      return;
    forget(pane.id);
    if (connection) await stopAndRemove(connection, pane.id).catch(fail);
  };
  const paneState = useCallback(
    (id: string, state: PaneState) => {
      setPaneStates(s => (s[id] === state ? s : { ...s, [id]: state }));
      if (state === 'exited' || state === 'error')
        setPanes(panes => panes.map(p => (p.id === id ? { ...p, endedAt: Date.now() } : p)));
    },
    [setPaneStates, setPanes]
  );
  const observeAgent = useCallback(
    (id: string, value: AgentObservation | null) =>
      setAgentObservations(previous => {
        const next = { ...previous };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      }),
    [setAgentObservations]
  );
  const focusAgent = (id: string, solo = false) => {
    setSelectedPane(id);
    setTerminalVisible(true);
    if (solo) setMaxPane(id);
    else if (maxPane && maxPane !== id) setMaxPane(null);
    setPaneFocus(previous => ({ id, sequence: previous.sequence + 1 }));
  };
  const renameAgent = async (pane: Pane) => {
    const data = await ask({
      title: 'Rename session',
      description:
        'Set a fixed name, or leave it empty to follow the title reported by the terminal.',
      fields: [{ name: 'name', label: 'Session name', value: paneName(pane), optional: true }],
      submit: 'Rename',
    });
    if (data)
      setPanes(previous =>
        previous.map(item =>
          item.id === pane.id ? { ...item, customName: terminalTitle(data.name) } : item
        )
      );
  };
  const updateTerminalTitle = useCallback(
    (id: string, value: string) => {
      const title = terminalTitle(value);
      setPanes(previous => {
        if (!previous.some(pane => pane.id === id && (pane.title ?? '') !== title)) return previous;
        return previous.map(pane => (pane.id === id ? { ...pane, title } : pane));
      });
    },
    [setPanes]
  );
  const restartAgent = (pane: Pane) => {
    if (!connection) return;
    void sessionCall(connection, 'pane.restart', { id: pane.id, resume: false })
      .then(next =>
        setPanes(previous =>
          previous.map(item =>
            item.id === pane.id
              ? {
                  ...item,
                  generation: next.generation,
                  title: undefined,
                  startedAt: Date.now(),
                  endedAt: undefined,
                }
              : item
          )
        )
      )
      .catch(fail);
  };
  // Panes outlive the window; only the lease is released so the next view attaches cleanly.
  const detachWindowPanes = useCallback(() => releasePaneLeases(), []);
  return {
    addPane,
    customPane,
    closePane,
    paneState,
    observeAgent,
    focusAgent,
    renameAgent,
    updateTerminalTitle,
    restartAgent,
    detachWindowPanes,
  };
}

// The server refuses to remove a pane it still believes is running, and the exit
// is observed by its own reader thread a moment after the kill.
async function stopAndRemove(connection: string, id: string) {
  await sessionCall(connection, 'pane.stop', { id }).catch(() => {});
  for (let attempt = 0; ; attempt++) {
    try {
      await sessionCall(connection, 'pane.remove', { id });
      return;
    } catch (error) {
      if (attempt >= 20) throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}
