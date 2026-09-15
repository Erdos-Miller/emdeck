// In-page stand-in for the emdeck-session server, shared by every desktop e2e fixture.
// Installed with page.addInitScript({ path }), so it must stay a plain script.
(() => {
  const state = window;
  const session = {
    workspaces: [],
    panes: [],
    revision: 1,
    waiters: [],
    actions: [],
  };
  const wake = () => {
    session.revision += 1;
    const waiting = session.waiters;
    session.waiters = [];
    for (const resolve of waiting) resolve();
  };
  const idle = milliseconds =>
    new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      session.waiters.push(finish);
      setTimeout(finish, Math.max(0, Math.min(milliseconds, 20000)));
    });
  const find = id => {
    const pane = session.panes.find(item => item.id === String(id));
    if (!pane) throw 'Pane no longer exists.';
    return pane;
  };
  const info = pane => {
    const { chunks, ...rest } = pane;
    void chunks;
    return rest;
  };
  const encode = text => {
    let binary = '';
    for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const snapshot = () => ({
    protocol: 2,
    serverId: 'fixture-server',
    revision: session.revision,
    workspaces: session.workspaces,
    panes: session.panes.map(info),
  });
  const request = async action => {
    const params = action.params ?? {};
    session.actions.push({ method: action.method, params });
    switch (action.method) {
      case 'ping':
        return { protocol: 2, serverId: 'fixture-server' };
      case 'session.snapshot':
        if (params.after === session.revision) await idle(Number(params.wait_ms) || 0);
        return snapshot();
      case 'workspace.create': {
        const existing = session.workspaces.find(item => item.root === params.root);
        if (existing) return existing;
        const created = {
          id: `workspace-${session.workspaces.length}`,
          name: String(params.name),
          root: String(params.root),
        };
        session.workspaces.push(created);
        wake();
        return created;
      }
      case 'workspace.remove':
        session.workspaces = session.workspaces.filter(item => item.id !== params.id);
        wake();
        return null;
      case 'pane.create': {
        if (state.__emdeckPaneError) throw state.__emdeckPaneError;
        const launch = params.launch;
        const pane = {
          id: `pane-${session.panes.length}`,
          generation: `generation-${session.panes.length}`,
          title: null,
          launch,
          running: true,
          restored: false,
          exitCode: null,
          startedAt: Math.floor(Date.now() / 1000),
          cols: Number(params.cols) || 80,
          rows: Number(params.rows) || 24,
          agent: {
            kind: String(launch.command || '').split(' ')[0] || 'shell',
            state: 'unknown',
            source: 'screen',
            reason: 'No lifecycle evidence yet',
            sessionId: null,
          },
          usage: null,
          sequence: 0,
          chunks: [],
          commandSequence: 0,
          commands: [],
        };
        session.panes.push(pane);
        wake();
        return info(pane);
      }
      case 'pane.restart': {
        const pane = find(params.id);
        pane.generation = `${pane.generation}-again`;
        pane.running = true;
        pane.exitCode = null;
        pane.title = null;
        pane.usage = null;
        pane.sequence = 0;
        pane.chunks = [];
        wake();
        return info(pane);
      }
      case 'pane.stop':
        find(params.id).running = false;
        wake();
        return null;
      case 'pane.remove': {
        const pane = find(params.id);
        if (pane.running) throw 'Stop the running pane before removing it.';
        session.panes = session.panes.filter(item => item.id !== pane.id);
        wake();
        return null;
      }
      case 'pane.attach':
        return info(find(params.id));
      case 'pane.detach':
      case 'pane.input':
      case 'pane.resize':
        return null;
      case 'pane.read': {
        const pane = find(params.id);
        const after = params.after === null ? null : Number(params.after);
        const commandsAfter = params.commands_after === null ? null : Number(params.commands_after);
        if (pane.running && after === pane.sequence && commandsAfter === pane.commandSequence)
          await idle(Number(params.wait_ms) || 0);
        const reset = after === null;
        const text = pane.chunks
          .filter(chunk => reset || chunk.sequence > after)
          .map(chunk => chunk.text)
          .join('');
        return {
          sequence: pane.sequence,
          reset,
          data: text ? encode(text) : '',
          text: '',
          pane: info(pane),
          commandSequence: pane.commandSequence,
          commands:
            commandsAfter === null
              ? []
              : pane.commands.filter(command => command.sequence > commandsAfter),
        };
      }
      case 'pane.paths':
        return { input: state.__emdeckPathInput ?? "'/fixture/dropped.png' " };
      case 'pane.attachment': {
        if (state.__emdeckAttachmentDelay)
          await new Promise(resolve => {
            state.__emdeckReleaseAttachment = resolve;
          });
        if (state.__emdeckAttachmentError) throw state.__emdeckAttachmentError;
        const written = Number(params.offset) + atob(String(params.data)).length;
        if (written < Number(params.total)) return { input: null };
        state.__emdeckAttachmentCount = (state.__emdeckAttachmentCount ?? 0) + 1;
        return {
          input: state.__emdeckAttachmentInput ?? `'C:/temp/emdeck-attachments/${params.name}' `,
        };
      }
      case 'account.usage':
        if (state.__emdeckAccountError) throw state.__emdeckAccountError;
        return (
          state.__emdeckAccountUsage ?? {
            source: 'Codex CLI account',
            updatedAt: Math.floor(Date.now() / 1000),
            limits: [],
          }
        );
      default:
        return null;
    }
  };
  state.__emdeckSession = {
    request,
    actions: session.actions,
    panes: () => session.panes.map(info),
    ids: () => session.panes.map(pane => pane.id),
    emit: (id, text) => {
      const pane = find(id);
      pane.sequence += 1;
      pane.chunks.push({ sequence: pane.sequence, text });
      const start = text.indexOf('\u001b]2;');
      const end = start < 0 ? -1 : text.indexOf('\u0007', start);
      if (end > start) pane.title = text.slice(start + 4, end);
      wake();
    },
    exit: (id, code = 0) => {
      const pane = find(id);
      pane.running = false;
      pane.exitCode = code;
      pane.agent = { ...pane.agent, state: 'stopped' };
      wake();
    },
    command: (id, command) => {
      const pane = find(id);
      pane.commandSequence += 1;
      pane.commands.push({ sequence: pane.commandSequence, ...command });
      wake();
    },
    usage: (id, usage) => {
      find(id).usage = usage;
      wake();
    },
    agent: (id, agent) => {
      const pane = find(id);
      pane.agent = { ...pane.agent, ...agent };
      wake();
    },
  };
})();
