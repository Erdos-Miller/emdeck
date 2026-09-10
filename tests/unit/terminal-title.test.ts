import { describe, expect, it } from 'vitest';
import {
  paneName,
  sessionName,
  terminalTitle,
} from '../../src/features/agents/services/terminal-title';

describe('terminal titles', () => {
  it('keeps readable Unicode while removing controls and limiting title length', () => {
    expect(terminalTitle('  Fix 登录 🚀\u0007\u202e  ')).toBe('Fix 登录 🚀');
    expect(Array.from(terminalTitle('🚀'.repeat(300)))).toHaveLength(200);
    expect(terminalTitle('\u0000\t\n ')).toBe('');
  });

  it('follows terminal titles until a user pins a name, and falls back when cleared', () => {
    expect(paneName({ name: 'Claude' })).toBe('Claude');
    expect(paneName({ name: 'Claude', title: 'Fix login' })).toBe('Fix login');
    expect(paneName({ name: 'Claude', title: 'Fix login', customName: 'My task' })).toBe('My task');
    expect(paneName({ name: 'Claude', title: 'Next task', customName: '' })).toBe('Next task');
    expect(paneName({ name: 'Claude', title: '' })).toBe('Claude');
  });

  it('accepts background servers both with and without title metadata', () => {
    const launch = {
      workspaceId: 'w',
      name: 'Claude',
      cwd: '/fixture',
      shell: '',
      command: 'claude',
      resumeOnRestart: false,
    };
    expect(sessionName({ launch })).toBe('Claude');
    expect(sessionName({ launch, title: 'Detached task' })).toBe('Detached task');
    expect(sessionName({ launch, title: '\u0000' })).toBe('Claude');
  });
});
