import { expect, it, vi } from 'vitest';
import { discoverProjectRuns } from '../../src/features/runs/services/discoverProjectRuns';
import type { RunDiscoveryPort } from '../../src/features/runs/services/discoverProjectRuns';

const entry = (name: string, isDir = false) => ({ name, path: name, isDir, isSymlink: false });
const port = (): RunDiscoveryPort => ({
  list: vi.fn(async () => [entry('package.json'), entry('bun.lock'), entry('node_modules', true)]),
  read: vi.fn(async () => ({ content: '{"scripts":{"dev":"bun server.ts"}}', revision: 'one' })),
});
it('discovers Bun through a shallow port without reading dependency folders', async () => {
  const adapter = port();
  const found = await discoverProjectRuns(adapter, '/project', 'auto', () => true);
  expect(found?.configs[0].command).toBe('bun run dev');
  expect(adapter.list).toHaveBeenCalledExactlyOnceWith('/project');
  expect(adapter.read).toHaveBeenCalledExactlyOnceWith('/project', 'package.json');
});
it('does not read a manifest after the active workspace changes', async () => {
  const adapter = port();
  expect(await discoverProjectRuns(adapter, '/old', 'auto', () => false)).toBeNull();
  expect(adapter.read).not.toHaveBeenCalled();
});
it('ignores a late manifest response after cancellation', async () => {
  const adapter = port();
  const current = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  expect(await discoverProjectRuns(adapter, '/old', 'auto', current)).toBeNull();
});
it('returns actionable feedback for missing and malformed manifests', async () => {
  const adapter = port();
  adapter.list = vi.fn(async () => []);
  expect((await discoverProjectRuns(adapter, '/project', 'auto', () => true))?.notice).toContain(
    'No package.json'
  );
  expect(adapter.read).not.toHaveBeenCalled();
  const invalid = port();
  invalid.read = vi.fn(async () => ({ content: '{', revision: 'one' }));
  expect((await discoverProjectRuns(invalid, '/project', 'auto', () => true))?.notice).toContain(
    'Could not detect scripts'
  );
});
