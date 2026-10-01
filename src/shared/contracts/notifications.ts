export type NotificationEvent = 'waiting' | 'done' | 'error';

export interface NotificationSettings {
  enabled: boolean;
  waiting: boolean;
  done: boolean;
  error: boolean;
  volume: number;
  unfocusedOnly: boolean;
}

export interface NotificationSoundPort {
  play: (event: NotificationEvent, volume: number) => void;
}
