import { useState } from 'react';
import type {
  NotificationEvent,
  NotificationSettings as Preferences,
} from '../../../shared/contracts/notifications';

const events: { event: NotificationEvent; label: string; detail: string }[] = [
  {
    event: 'waiting',
    label: 'Waiting for me',
    detail: 'An agent asks a question or needs approval.',
  },
  {
    event: 'done',
    label: 'Done',
    detail: 'An agent finishes a turn or a process exits successfully.',
  },
  {
    event: 'error',
    label: 'Error',
    detail: 'A session fails to start or a process exits with an error.',
  },
];

export default function NotificationSettings({
  settings,
  onChange,
  onPreview,
}: {
  settings: Preferences;
  onChange: (settings: Preferences) => void;
  onPreview: (event: NotificationEvent, volume: number) => Promise<boolean>;
}) {
  const [previewError, setPreviewError] = useState('');
  const handleEnabled: React.ChangeEventHandler<HTMLInputElement> = event =>
    onChange({ ...settings, enabled: event.target.checked });
  const handleFocus: React.ChangeEventHandler<HTMLInputElement> = event =>
    onChange({ ...settings, unfocusedOnly: event.target.checked });
  const handleVolume: React.ChangeEventHandler<HTMLInputElement> = event =>
    onChange({ ...settings, volume: Number(event.target.value) });
  return (
    <section className='settings-section notification-settings' aria-label='Sound notifications'>
      <h3>Sound notifications</h3>
      <p className='dialog-description'>
        Applies to all projects, including connected background sessions. Existing statuses stay
        silent when opening or reconnecting to a session.
      </p>
      <div className='setting-row'>
        <label htmlFor='notification-enabled'>Enable notification sounds</label>
        <input
          id='notification-enabled'
          type='checkbox'
          checked={settings.enabled}
          onChange={handleEnabled}
        />
      </div>
      {events.map(({ event, label, detail }) => {
        const handleEvent: React.ChangeEventHandler<HTMLInputElement> = input =>
          onChange({ ...settings, [event]: input.target.checked });
        const handlePreview = async () => {
          const played = await onPreview(event, settings.volume);
          setPreviewError(
            played ? '' : 'Sound could not play. Check your audio output and try again.'
          );
        };
        return (
          <div className='setting-row' key={event}>
            <label htmlFor={`notification-${event}`}>
              {label}
              <small>{detail}</small>
            </label>
            <button
              className='button secondary'
              disabled={settings.volume === 0}
              onClick={handlePreview}
              aria-label={`Preview ${label.toLowerCase()} sound`}
            >
              Preview
            </button>
            <input
              id={`notification-${event}`}
              type='checkbox'
              checked={settings[event]}
              disabled={!settings.enabled}
              onChange={handleEvent}
            />
          </div>
        );
      })}
      <div className='setting-row'>
        <label htmlFor='notification-volume'>
          Notification volume <small>{settings.volume}%</small>
        </label>
        <input
          id='notification-volume'
          type='range'
          min='0'
          max='100'
          step='5'
          value={settings.volume}
          onChange={handleVolume}
        />
      </div>
      <div className='setting-row'>
        <label htmlFor='notification-unfocused'>Only when this window is unfocused</label>
        <input
          id='notification-unfocused'
          type='checkbox'
          checked={settings.unfocusedOnly}
          disabled={!settings.enabled}
          onChange={handleFocus}
        />
      </div>
      {previewError && <p role='alert'>{previewError}</p>}
    </section>
  );
}
