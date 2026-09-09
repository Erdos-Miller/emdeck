import { describe, expect, it } from 'vitest';
import {
  detectRuns,
  rememberRun,
  restoreRuns,
} from '../../src/features/runs/services/runDiscovery';
const scripts = { dev: 'bun server.ts', 'test:unit': 'bun test' };
describe('project script discovery', () => {
  it.each(['bun.lock', 'bun.lockb'])('detects Bun from %s without reading a lockfile', lock => {
    const found = detectRuns({ scripts }, ['package.json', lock]);
    expect(found.runner).toBe('bun');
    expect(found.reason).toBe(lock);
    expect(found.configs.map(run => run.command)).toEqual(['bun run dev', 'bun run test:unit']);
  });
  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['npm-shrinkwrap.json', 'npm'],
    ['package-lock.json', 'npm'],
  ])('detects %s', (lock, runner) => {
    expect(detectRuns({ scripts }, [lock]).configs[0].command).toBe(`${runner} run dev`);
  });
  it('honors a declaration and reports stale conflicting lockfiles', () => {
    const found = detectRuns({ packageManager: 'bun@1.3.0', scripts }, ['package-lock.json']);
    expect(found.runner).toBe('bun');
    expect(found.reason).toContain('packageManager');
    expect(found.notice).toContain('other lockfiles');
    expect(
      detectRuns({ devEngines: { packageManager: { name: 'pnpm', version: '10' } }, scripts }, [])
        .runner
    ).toBe('pnpm');
  });
  it('makes ambiguous or unsupported projects explicit and allows an override', () => {
    const found = detectRuns({ scripts }, ['bun.lock', 'yarn.lock']);
    expect(found.configs).toEqual([]);
    expect(found.notice).toContain('Multiple lockfiles');
    expect(detectRuns({ scripts }, ['bun.lock', 'yarn.lock'], 'bun').configs[0].command).toBe(
      'bun run dev'
    );
    expect(detectRuns({ packageManager: 'unknown@1', scripts }, []).notice).toContain(
      'Unsupported'
    );
    expect(detectRuns({ packageManager: 'unknown@1', scripts }, [], 'pnpm').runner).toBe('pnpm');
  });
  it('recognizes Bun hints and keeps stable IDs when the runner changes', () => {
    expect(detectRuns({ scripts }, ['bunfig.toml']).runner).toBe('bun');
    expect(detectRuns({ scripts, engines: { bun: '>=1' } }, []).runner).toBe('bun');
    expect(detectRuns({ scripts }, []).reason).toContain('Default');
    expect(detectRuns({ scripts }, ['bun.lock']).configs[0].id).toBe(
      detectRuns({ scripts }, ['yarn.lock']).configs[0].id
    );
  });
  it('reports malformed metadata and never incorporates script names as shell syntax', () => {
    expect(() => detectRuns(null, [])).toThrow('object');
    expect(() => detectRuns({ scripts: [] }, [])).toThrow('scripts field');
    const found = detectRuns(
      {
        scripts: {
          dev: 'echo safe',
          '-e': 'oops',
          'test;whoami': 'oops',
          'test$(whoami)': 'oops',
          'two words': 'oops',
          empty: '',
          numeric: 1,
        },
      },
      []
    );
    expect(found.configs.map(run => run.command)).toEqual(['npm run dev']);
    expect(found.notice).toContain('6 scripts');
  });
});
describe('custom commands and recent history', () => {
  it('migrates custom and edited presets without preserving the old forced npm detection', () => {
    const restored = restoreRuns(null, [
      { id: 'npm:dev', name: 'npm dev', command: 'npm run dev', cwd: '' },
      { id: 'npm:build', name: 'Build app', command: 'bun run build', cwd: 'apps/web' },
      { id: 'mine', name: 'Backend', command: 'cargo run', cwd: 'api' },
    ]);
    expect(restored.custom.map(run => run.name)).toEqual(['Build app', 'Backend']);
    expect(restored.custom.every(run => run.source === 'custom')).toBe(true);
    expect(restored.custom[0].cwd).toBe('apps/web');
  });
  it('restores an intentionally empty custom list without reimporting deleted commands', () => {
    expect(
      restoreRuns(
        {
          version: 1,
          custom: [],
          runner: 'bun',
          selected: 'detected:dev',
          recent: [{ id: 'detected:dev', at: 1 }],
        },
        [{ id: 'old', name: 'Old', command: 'echo old', cwd: '' }]
      )
    ).toEqual({
      version: 1,
      custom: [],
      runner: 'bun',
      selected: 'detected:dev',
      recent: [{ id: 'detected:dev', at: 1 }],
    });
  });
  it('deduplicates recent launches, orders latest first and caps history', () => {
    const recent = Array.from({ length: 8 }, (_, i) => ({ id: String(i), at: 8 - i }));
    const next = rememberRun(recent, '4', 9);
    expect(next[0]).toEqual({ id: '4', at: 9 });
    expect(next).toHaveLength(8);
    expect(next.filter(entry => entry.id === '4')).toHaveLength(1);
    expect(rememberRun(next, 'new', 10).map(entry => entry.id)).toEqual([
      'new',
      '4',
      '0',
      '1',
      '2',
      '3',
      '5',
      '6',
    ]);
  });
});
