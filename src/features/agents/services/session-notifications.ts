import type {
  NotificationEvent,
  NotificationSettings,
  NotificationSoundPort,
} from '../../../shared/contracts/notifications';
import type { AgentObservation, PaneState } from '../../../shared/contracts/workspace';
import type { SessionPane } from '../../../shared/contracts/sessions';

type Status = 'starting' | 'unknown' | 'working' | 'waiting' | 'ready' | 'done' | 'error';
export interface NotificationSession {
  key: string;
  generation: string;
  status: Status;
}

export const localNotificationStatus = (
  state?: PaneState,
  observation?: AgentObservation
): Status => {
  if (!state || state === 'starting' || state === 'preview') return 'starting';
  if (state === 'error') return 'error';
  if (state === 'exited') return 'done';
  if (observation?.activity === 'attention' || observation?.activity === 'question')
    return 'waiting';
  return observation?.activity ?? 'unknown';
};

export const backgroundNotificationStatus = (pane: SessionPane): Status => {
  if (!pane.running) {
    if (pane.exitCode === null) return 'unknown';
    return pane.exitCode === 0 ? 'done' : 'error';
  }
  if (pane.agent.state === 'blocked') return 'waiting';
  if (pane.agent.state === 'idle') return 'ready';
  if (pane.agent.state === 'done') return 'done';
  return pane.agent.state === 'working' ? 'working' : 'unknown';
};

/** Advance evidence even when muted; settings changes never replay old alerts. */
export const createSessionNotifications = (sound: NotificationSoundPort) => {
  const previous = new Map<
    string,
    {
      generation: string;
      status: Status;
      busy: boolean;
      completed: boolean;
    }
  >();
  return (sessions: NotificationSession[], settings: NotificationSettings, focused: boolean) => {
    const present = new Set(sessions.map(session => session.key));
    for (const key of previous.keys()) if (!present.has(key)) previous.delete(key);
    const events = new Set<NotificationEvent>();
    for (const session of sessions) {
      const before = previous.get(session.key);
      const { status, generation } = session;
      // A first snapshot or a new process is a baseline, not an event.
      if (!before || before.generation !== generation) {
        previous.set(session.key, {
          generation,
          status,
          busy: status === 'working',
          completed: status === 'done',
        });
        continue;
      }
      // Output redraws may temporarily hide status evidence. Keep the last
      // meaningful state so repeated waiting/ready screens cannot ring again.
      if (status === 'unknown') continue;
      if (status !== before.status) {
        if (status === 'waiting') events.add('waiting');
        if (status === 'error') events.add('error');
        if ((status === 'done' || (status === 'ready' && before.busy)) && !before.completed)
          events.add('done');
      }
      previous.set(session.key, {
        generation,
        status,
        busy: status === 'working' || (status === 'waiting' && before.busy),
        completed: status === 'done' || (status === 'ready' && (before.busy || before.completed)),
      });
    }
    if (!settings.enabled || settings.volume <= 0 || (settings.unfocusedOnly && focused)) return;
    // Several sessions in one snapshot share a single, most urgent sound.
    const event = (['error', 'waiting', 'done'] as const).find(
      event => events.has(event) && settings[event]
    );
    if (event) sound.play(event, settings.volume);
  };
};
