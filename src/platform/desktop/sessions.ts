import { call } from './api';
import type { SessionAction, SessionMethods } from '../../shared/contracts/sessions';
export const sessionCall = async <M extends keyof SessionMethods>(
  connection: string,
  method: M,
  params: SessionMethods[M]['params']
): Promise<SessionMethods[M]['result']> =>
  call('session_request', { connection, action: { method, params } as SessionAction }) as Promise<
    SessionMethods[M]['result']
  >;
