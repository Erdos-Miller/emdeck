import { describe, expect, it } from 'vitest';
import { restoreHiddenSessions } from '../../src/features/agents/services/session-visibility';

describe('hidden session preferences', () => {
  it('rejects malformed storage and retains distinct machine-qualified keys', () => {
    for (const value of [null, false, 'terminal:1', { keys: [] }])
      expect(restoreHiddenSessions(value)).toEqual([]);
    expect(
      restoreHiddenSessions([
        'terminal:1',
        'local/1',
        'remote/1',
        'local/1',
        null,
        2,
        '',
        'x'.repeat(513),
      ])
    ).toEqual(['terminal:1', 'local/1', 'remote/1']);
  });

  it('bounds restored preferences to the supported local and background view counts', () => {
    expect(
      restoreHiddenSessions(Array.from({ length: 1000 }, (_, index) => `local/${index}`))
    ).toHaveLength(128);
  });
});
