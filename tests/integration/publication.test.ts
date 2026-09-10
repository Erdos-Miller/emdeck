import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const script = pathToFileURL(resolve('scripts/release/source-snapshot.mjs')).href;
const withFixture = (run: (root: string, output: string, outside: string) => void) => {
  const base = realpathSync(tmpdir());
  const directory = mkdtempSync(join(base, 'emdeck-publication-'));
  if (!directory.startsWith(base + sep)) throw new Error('Unexpected fixture directory');
  const root = join(directory, 'repo');
  const output = join(directory, 'snapshot');
  const outside = join(directory, 'private');
  for (const path of [root, output, outside]) mkdirSync(path);
  try {
    execFileSync('git', ['init', '--quiet', root], { windowsHide: true });
    run(root, output, outside);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const snapshot = (root: string, output: string) =>
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'const { snapshotSource } = await import(process.env.EMDECK_SCAN_MODULE); console.log(JSON.stringify(snapshotSource(process.env.EMDECK_SCAN_ROOT, process.env.EMDECK_SCAN_OUTPUT)));',
    ],
    {
      windowsHide: true,
      stdio: 'pipe',
      env: {
        ...process.env,
        EMDECK_SCAN_MODULE: script,
        EMDECK_SCAN_ROOT: root,
        EMDECK_SCAN_OUTPUT: output,
      },
    }
  ).toString();

it('scans force-tracked ignored files while excluding untracked local credentials and outputs', () => {
  withFixture((root, output) => {
    writeFileSync(join(root, '.gitignore'), '.env\n*.log\n');
    writeFileSync(join(root, '.env'), 'SYNTHETIC_TEST_ONLY=true\n');
    writeFileSync(join(root, 'debug.log'), 'Synthetic tracked output must be scanned.\n');
    writeFileSync(join(root, 'local.log'), 'Untracked output.\n');
    writeFileSync(join(root, 'new-source.ts'), 'export const ready = true;\n');
    execFileSync('git', ['add', '-f', 'debug.log'], { cwd: root, windowsHide: true });
    const files = JSON.parse(snapshot(root, output));
    expect(files.sort()).toEqual(['.gitignore', 'debug.log', 'new-source.ts']);
    expect(readFileSync(join(output, 'debug.log'), 'utf8')).toContain('must be scanned');
  });
});

it('refuses a tracked directory replaced by a link to files outside the repository', () => {
  withFixture((root, output, outside) => {
    const source = join(root, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'config.txt'), 'Public fixture.');
    execFileSync('git', ['add', 'source/config.txt'], { cwd: root, windowsHide: true });
    rmSync(join(source, 'config.txt'));
    rmdirSync(source);
    writeFileSync(join(outside, 'config.txt'), 'Private fixture; must not be copied.');
    symlinkSync(outside, source, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => snapshot(root, output)).toThrow('Review publication symlink');
    expect(existsSync(join(output, 'source/config.txt'))).toBe(false);
  });
});
