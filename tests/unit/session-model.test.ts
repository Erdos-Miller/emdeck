import { describe, expect, it } from 'vitest';
import {
  localMachine,
  restoreMachines,
  sessionKey,
  terminalInput,
} from '../../src/features/agents/services/session-model';
describe('persistent session model', () => {
  it('keeps machine namespaces separate and validates restored preferences', () => {
    expect(sessionKey('local', 'one')).not.toBe(sessionKey('remote', 'one'));
    expect(restoreMachines(null)).toEqual([localMachine]);
    expect(
      restoreMachines([{ id: 'broken', name: 'bad', target: { kind: 'ssh', port: '22' } }])
    ).toEqual([localMachine]);
    const saved = {
      id: 'remote',
      name: 'Build box',
      enabled: true,
      target: { kind: 'ssh', host: 'workbox', binary: 'emdeck-session', port: null },
    };
    expect(restoreMachines([saved, saved])).toEqual([localMachine, saved]);
  });
  it('filters duplicate terminal query responses without removing keyboard escapes or Unicode', () => {
    expect(terminalInput('\u001b[1;20R\u001b[?1;2c\u001b[0n')).toBe('');
    expect(terminalInput('hi\u001b[8;24;80tthere')).toBe('hithere');
    expect(terminalInput('\u001b[A\u001b[B\u001b[200~你好\ntext\u001b[201~\r')).toBe(
      '\u001b[A\u001b[B\u001b[200~你好\ntext\u001b[201~\r'
    );
  });
});
