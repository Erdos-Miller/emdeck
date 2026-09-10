import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { detectRuns } from '../../src/features/runs/services/runDiscovery';
// Cold PowerShell/Bun startup on hosted Windows runners can exceed 15 seconds.
// Keep the process bounded, with a separate allowance for assertions and cleanup.
const commandTimeout = process.platform === 'win32' ? 60000 : 15000;
it(
  'executes a detected Bun script through the desktop default shell',
  () => {
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
      const windows = process.platform === 'win32';
      const program = windows ? 'powershell.exe' : '/bin/sh';
      const args = windows ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-lc', command];
      const started = performance.now();
      const output = spawnSync(program, args, {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: commandTimeout,
      });
      const diagnostics = [
        `${program}: ${command} (${Math.round(performance.now() - started)} ms; limit ${commandTimeout} ms)`,
        `Launch error: ${output.error?.message ?? 'none'}`,
        `Exit status: ${output.status}; signal: ${output.signal}`,
        `stdout: ${output.stdout}`,
        `stderr: ${output.stderr}`,
      ].join('\n');
      // Bun is a repository prerequisite; missing/broken launches must fail, not skip.
      expect(output.error, diagnostics).toBeUndefined();
      expect(output.signal, diagnostics).toBeNull();
      expect(output.status, diagnostics).toBe(0);
      expect(output.stdout).toContain('EMDECK_BUN_RUN_OK');
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  },
  commandTimeout + 10000
);
