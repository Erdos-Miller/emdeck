import { describe, expect, it, vi } from 'vitest';
import {
  backgroundNotificationStatus,
  createSessionNotifications,
  localNotificationStatus,
} from '../../src/features/agents/services/session-notifications';
import type { NotificationSession } from '../../src/features/agents/services/session-notifications';
import {
  defaultNotifications,
  readNotificationSettings,
} from '../../src/features/settings/services/notification-settings';
import {
  mergeSettings,
  parseProjectConfig,
} from '../../src/features/settings/services/projectConfig';
import { defaults } from '../../src/features/settings/lib/defaults';
import type { SettingsOverrides } from '../../src/shared/contracts/projectConfig';
import type { SessionPane } from '../../src/shared/contracts/sessions';

const session = (
  status: NotificationSession['status'],
  key = 'one',
  generation = '1'
): NotificationSession => ({ key, generation, status });
const setup = () => {
  const play = vi.fn();
  const update = createSessionNotifications({ play });
  const status = (value: NotificationSession['status']) =>
    update([session(value)], defaultNotifications, true);
  return { play, update, status };
};

describe('session sound transitions', () => {
  it.each(['waiting', 'ready', 'done', 'error'] as const)(
    'baselines %s silently on load and reconnect',
    initial => {
      const { play, update } = setup();
      update([session(initial)], defaultNotifications, true);
      update([], defaultNotifications, true);
      update([session(initial)], defaultNotifications, true);
      update([session(initial, 'one', '2')], defaultNotifications, true);
      expect(play).not.toHaveBeenCalled();
    }
  );
  it('rings for waiting, verified completion and error exactly once, surviving ambiguous redraws', () => {
    const { play, status } = setup();
    for (const value of [
      'starting',
      'ready',
      'working',
      'waiting',
      'unknown',
      'waiting',
      'working',
      'unknown',
      'ready',
      'unknown',
      'ready',
      'done',
      'error',
      'error',
    ] as const)
      status(value);
    expect(play.mock.calls).toEqual([
      ['waiting', 40],
      ['done', 40],
      ['error', 40],
    ]);
  });
  it('rings again for a new task and detects launch failures and successful process exits', () => {
    const { play, status } = setup();
    for (const value of [
      'starting',
      'error',
      'starting',
      'working',
      'ready',
      'working',
      'done',
    ] as const)
      status(value);
    expect(play.mock.calls.map(call => call[0])).toEqual(['error', 'done', 'done']);
  });
  it('coalesces a snapshot to the most urgent enabled event', () => {
    const { play, update } = setup();
    update(
      ['a', 'b', 'c'].map(key => session('working', key)),
      defaultNotifications,
      false
    );
    update(
      [session('waiting', 'a'), session('done', 'b'), session('error', 'c')],
      defaultNotifications,
      false
    );
    expect(play.mock.calls).toEqual([['error', 40]]);
  });
  it('announces an explicit completion even if a short task finished between snapshots', () => {
    const { play, status } = setup();
    status('ready');
    status('done');
    status('ready');
    status('done');
    expect(play.mock.calls).toEqual([['done', 40]]);
  });
  it.each([{ enabled: false }, { volume: 0 }, { waiting: false }, { unfocusedOnly: true }])(
    'advances evidence while suppressed by %j without later replay',
    overrides => {
      const { play, update, status } = setup();
      status('working');
      update([session('waiting')], { ...defaultNotifications, ...overrides }, true);
      status('waiting');
      expect(play).not.toHaveBeenCalled();
      status('working');
      update(
        [session('waiting')],
        { ...defaultNotifications, unfocusedOnly: true, volume: 65 },
        false
      );
      expect(play.mock.calls).toEqual([['waiting', 65]]);
    }
  );
  it('uses native failures ahead of stale agent observations and maps background exit codes', () => {
    const observation = {
      activity: 'ready' as const,
      contextPercent: null,
      model: null,
      observedAt: 1,
    };
    expect(localNotificationStatus('error', observation)).toBe('error');
    expect(localNotificationStatus('starting', observation)).toBe('starting');
    expect(localNotificationStatus('running', { ...observation, activity: 'attention' })).toBe(
      'waiting'
    );
    for (const [exitCode, expected] of [
      [null, 'unknown'],
      [0, 'done'],
      [1, 'error'],
    ] as const)
      expect(backgroundNotificationStatus({ running: false, exitCode } as SessionPane)).toBe(
        expected
      );
    for (const [state, expected] of [
      ['blocked', 'waiting'],
      ['idle', 'ready'],
      ['done', 'done'],
      ['working', 'working'],
    ] as const)
      expect(backgroundNotificationStatus({ running: true, agent: { state } } as SessionPane)).toBe(
        expected
      );
  });
});

describe('personal notification preferences', () => {
  it('migrates older settings and sanitizes malformed values without losing explicit mute', () => {
    expect(readNotificationSettings(undefined)).toEqual(defaultNotifications);
    expect(readNotificationSettings({ enabled: false, waiting: false, volume: 0 })).toEqual({
      ...defaultNotifications,
      enabled: false,
      waiting: false,
      volume: 0,
    });
    expect(readNotificationSettings({ volume: 400, done: 'false' }).volume).toBe(100);
    expect(readNotificationSettings({ volume: NaN }).volume).toBe(40);
    expect(readNotificationSettings({ done: 'false' }).done).toBe(true);
  });
  it('rejects project overrides of personal sound settings', () => {
    const incoming = { notifications: { ...defaultNotifications, enabled: false } };
    expect(
      parseProjectConfig(JSON.stringify({ version: 1, settings: incoming }))?.settings
    ).toEqual({});
    expect(mergeSettings(defaults, incoming as SettingsOverrides).notifications).toEqual(
      defaultNotifications
    );
  });
});
