import { describe, expect, it } from 'vitest';
import { qualifyRef, shortRef } from '../../src/features/git/services/references';

describe('branch reference qualification', () => {
  const local = ['main', 'dev', 'origin/shared', 'dima/feature/branch-name'];
  const remote = ['origin/main', 'origin/shared', 'upstream/main'];

  it('qualifies bare names and preserves already-qualified references', () => {
    expect(qualifyRef('main', local, remote)).toBe('refs/heads/main');
    expect(qualifyRef('dima/feature/branch-name', local, remote)).toBe(
      'refs/heads/dima/feature/branch-name'
    );
    expect(qualifyRef('upstream/main', local, remote)).toBe('refs/remotes/upstream/main');
    expect(qualifyRef('refs/heads/main', local, remote)).toBe('refs/heads/main');
    expect(qualifyRef('refs/remotes/origin/main', local, remote)).toBe('refs/remotes/origin/main');
  });

  it('prefers a local branch that shadows a remote name', () => {
    expect(qualifyRef('origin/shared', local, remote)).toBe('refs/heads/origin/shared');
    expect(qualifyRef('origin/shared', [], remote)).toBe('refs/remotes/origin/shared');
  });

  it('reports unknown branches instead of guessing a namespace', () => {
    expect(qualifyRef('nope', local, remote)).toBeNull();
    expect(qualifyRef('HEAD', local, remote)).toBeNull();
    expect(qualifyRef('main', [], [])).toBeNull();
  });

  it('round-trips with shortRef', () => {
    expect(shortRef(qualifyRef('origin/shared', [], remote) ?? '')).toBe('origin/shared');
    expect(shortRef(qualifyRef('main', local, remote) ?? '')).toBe('main');
  });
});
