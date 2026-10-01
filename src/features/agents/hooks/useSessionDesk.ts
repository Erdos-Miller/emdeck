import { useEffect, useState } from 'react';
import { sessionCall } from '../../../platform/desktop/sessions';
import { readStored, store } from '../../../platform/storage/preferences';
import type {
  MachineConnection,
  SessionLaunch,
  SessionPane,
} from '../../../shared/contracts/sessions';
import { useSessionMachines } from './useSessionMachines';
import { sessionKey } from '../services/session-model';
import { backgroundSessions } from '../services/background-workspaces';

const launch = async (
  machine: MachineConnection,
  workspace: { root: string; name: string },
  launch: Omit<SessionLaunch, 'workspaceId'>
) => {
  const created = await sessionCall(machine.connection!, 'workspace.create', workspace);
  const pane = await sessionCall(machine.connection!, 'pane.create', {
    launch: { ...launch, workspaceId: created.id },
    cols: 100,
    rows: 30,
  });
  return pane;
};

export const useSessionDesk = (active: boolean) => {
  const controller = useSessionMachines(active);
  const [attached, setAttached] = useState<string[]>(() => {
    const value = readStored<unknown>('relay:session-views', []);
    return Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(0, 64) : [];
  });
  const [space, setSpace] = useState('all');
  const [solo, setSolo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [operation, setOperation] = useState<{
    kind: 'stop' | 'remove';
    machine: MachineConnection;
    pane: SessionPane;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [operationError, setOperationError] = useState('');
  useEffect(() => {
    store('relay:session-views', attached);
  }, [attached]);
  const selectSpace = (key: string) => {
    setSpace(key);
    setSolo(null);
  };
  const attach = (machine: MachineConnection, pane: SessionPane) => {
    const key = sessionKey(machine.profile.id, pane.id);
    if (!attached.includes(key) && attached.length >= 64) {
      setError('Up to 64 terminal views can be open at once. Detach a view to open another.');
      return false;
    }
    setError('');
    setAttached(previous => (previous.includes(key) ? previous : [...previous, key]));
    selectSpace('all');
    return true;
  };
  const detach = (key: string) => {
    setAttached(previous => previous.filter(id => id !== key));
    setSolo(null);
  };
  const requestOperation = (
    kind: 'stop' | 'remove',
    machine: MachineConnection,
    pane: SessionPane
  ) => {
    if (pending) return;
    setOperationError('');
    setOperation({ kind, machine, pane });
  };
  const dismissOperation = () => {
    if (!pending) setOperation(null);
  };
  const confirmOperation = async () => {
    if (!operation || pending) return;
    setPending(true);
    setOperationError('');
    try {
      const connection = operation.machine.connection;
      if (!connection) throw new Error('Connect to this machine before changing its sessions.');
      await sessionCall(connection, operation.kind === 'stop' ? 'pane.stop' : 'pane.remove', {
        id: operation.pane.id,
      });
      if (operation.kind === 'remove')
        detach(sessionKey(operation.machine.profile.id, operation.pane.id));
      setOperation(null);
    } catch (error) {
      setOperationError(String(error));
    } finally {
      setPending(false);
    }
  };
  const sessions = backgroundSessions(controller.machines);
  const attachedKeys = new Set(attached);
  const tiles = sessions.filter(session => attachedKeys.has(session.key));
  const visibleKeys = tiles.flatMap(session =>
    (!solo || solo === session.key) && (space === 'all' || `background:${space}` === session.space)
      ? [session.key]
      : []
  );
  return {
    ...controller,
    attached,
    attachedKeys,
    sessions,
    tiles,
    visibleKeys,
    space,
    solo,
    error: error || controller.storageError,
    operation,
    pending,
    operationError,
    setError,
    requestOperation,
    dismissOperation,
    setSolo,
    selectSpace,
    attach,
    launch,
    detach,
    confirmOperation,
  };
};
export type SessionDeskController = ReturnType<typeof useSessionDesk>;
