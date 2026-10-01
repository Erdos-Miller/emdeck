import { useEffect, useState } from 'react';
import type { BackgroundSession } from '../../features/agents/services/background-workspaces';
import {
  backgroundNotificationStatus,
  createSessionNotifications,
  localNotificationStatus,
} from '../../features/agents/services/session-notifications';
import {
  activateNotificationAudio,
  disposeNotificationAudio,
  playNotificationSound,
} from '../../platform/audio/notifications';
import type { WorkspaceController } from './useWorkspace';

export const useSessionNotifications = (
  model: Pick<WorkspaceController, 'panes' | 'paneStates' | 'agentObservations' | 'settings'>,
  background: BackgroundSession[]
) => {
  const [update] = useState(() => createSessionNotifications({ play: playNotificationSound }));
  const { panes, paneStates, agentObservations, settings } = model;
  useEffect(() => {
    const activate = () => {
      void activateNotificationAudio();
    };
    if (settings.notifications.enabled) {
      window.addEventListener('pointerdown', activate);
      window.addEventListener('keydown', activate);
    }
    return () => {
      window.removeEventListener('pointerdown', activate);
      window.removeEventListener('keydown', activate);
    };
  }, [settings.notifications.enabled]);
  useEffect(() => disposeNotificationAudio, []);
  useEffect(() => {
    update(
      [
        ...panes.map(pane => ({
          key: `local:${pane.id}`,
          generation: String(pane.restart ?? 0),
          status: localNotificationStatus(paneStates[pane.id], agentObservations[pane.id]),
        })),
        ...background
          .filter(session => session.machine.status === 'connected')
          .map(session => ({
            key: `background:${session.key}`,
            generation: `${session.machine.connection}/${session.pane.generation}`,
            status: backgroundNotificationStatus(session.pane),
          })),
      ],
      settings.notifications,
      document.hasFocus() && document.visibilityState === 'visible'
    );
  }, [panes, paneStates, agentObservations, background, settings.notifications, update]);
};
