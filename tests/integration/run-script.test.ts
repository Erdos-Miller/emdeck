import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { detectRuns } from '../../src/features/runs/services/runDiscovery';
const hasBun = spawnSync('bun', ['--version'], { windowsHide: true }).status === 0;
it.skipIf(!hasBun)('executes a detected Bun script through the desktop default shell', () => {
  const base = realpathSync(tmpdir());
  const root = mkdtempSync(join(base, 'emdeck-bun-run-'));
  const pkg = { scripts: { build: 'bun smoke.ts' } };
  const target = resolve(root);
  if (!target.startsWith(base + sep) || !target.includes('emdeck-bun-run-'))
    throw new Error('Unexpected test directory');
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
    writeFileSync(join(root, 'smoke.ts'), "console.log('EMDECK_BUN_RUN_OK');");
    const command = detectRuns(pkg, ['bun.lockb']).configs[0].command;
    const output =
      process.platform === 'win32'
        ? spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', command], {
            cwd: root,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
          })
        : spawnSync('/bin/sh', ['-lc', command], { cwd: root, encoding: 'utf8', timeout: 15000 });
    expect(output.status, output.stderr).toBe(0);
    expect(output.stdout).toContain('EMDECK_BUN_RUN_OK');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
