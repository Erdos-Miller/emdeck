import { useCallback, useEffect, useState } from 'react';
import { call, native } from '../../platform/desktop/api';
import { sessionCall } from '../../platform/desktop/sessions';
import type { SessionSnapshot } from '../../shared/contracts/sessions';
import type { Project } from '../../shared/contracts/workspace';

export interface SessionRuntime {
  connection: string | null;
  workspaceId: string | null;
  snapshot: SessionSnapshot | null;
  status: 'offline' | 'connecting' | 'ready';
  error: string;
  retry: () => void;
}
const offline: Omit<SessionRuntime, 'retry'> = {
  connection: null,
  workspaceId: null,
  snapshot: null,
  status: 'offline',
  error: '',
};

/** This window's connection to the session server that owns its terminals. */
export function useSessionRuntime(project: Project | null): SessionRuntime {
  const [runtime, setRuntime] = useState(offline);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const root = project?.root;
  const name = project?.name;
  useEffect(() => {
    if (!native || !root || !name) {
      setRuntime(offline);
      return;
    }
    let cancelled = false;
    let connection: string | undefined;
    const release = () => {
      if (connection) void call('session_disconnect', { connection }).catch(() => {});
      connection = undefined;
    };
    const open = async () => {
      setRuntime({ ...offline, status: 'connecting' });
      try {
        connection = await call('session_connect', { target: { kind: 'local' } });
        const workspace = await sessionCall(connection, 'workspace.create', { root, name });
        let after: number | null = null;
        while (!cancelled) {
          const snapshot: SessionSnapshot = await sessionCall(connection, 'session.snapshot', {
            after,
            wait_ms: 20000,
          });
          if (cancelled) break;
          after = snapshot.revision;
          setRuntime({
            connection,
            workspaceId: workspace.id,
            snapshot,
            status: 'ready',
            error: '',
          });
        }
      } catch (error) {
        if (!cancelled) setRuntime({ ...offline, error: String(error) });
      } finally {
        release();
      }
    };
    void open();
    return () => {
      cancelled = true;
      release();
    };
  }, [root, name, attempt]);
  return { ...runtime, retry };
}
