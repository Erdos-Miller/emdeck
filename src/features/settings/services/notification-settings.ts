import type { NotificationSettings } from '../../../shared/contracts/notifications';

export const defaultNotifications: NotificationSettings = {
  enabled: true,
  waiting: true,
  done: true,
  error: true,
  volume: 40,
  unfocusedOnly: false,
};

export const readNotificationSettings = (value: unknown): NotificationSettings => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const flag = (key: keyof NotificationSettings) =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (defaultNotifications[key] as boolean);
  return {
    enabled: flag('enabled'),
    waiting: flag('waiting'),
    done: flag('done'),
    error: flag('error'),
    unfocusedOnly: flag('unfocusedOnly'),
    volume:
      typeof raw.volume === 'number' && Number.isFinite(raw.volume)
        ? Math.max(0, Math.min(100, raw.volume))
        : defaultNotifications.volume,
  };
};
