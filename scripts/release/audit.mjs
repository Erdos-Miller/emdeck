import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { root, runTool } from './tools.mjs';
import { snapshotSource } from './source-snapshot.mjs';

execFileSync('bun', ['audit'], { cwd: root, windowsHide: true, stdio: 'inherit' });
const scratch = join(root, '.tmp');
mkdirSync(scratch, { recursive: true });
const snapshot = mkdtempSync(join(scratch, 'source-scan-'));
const emptyIgnore = mkdtempSync(join(scratch, 'scan-ignore-'));
for (const directory of [snapshot, emptyIgnore]) {
  if (dirname(directory) !== scratch) throw new Error('Unexpected scan directory');
}
const flags = [
  '--redact',
  '--no-banner',
  '--ignore-gitleaks-allow',
  '--config',
  join(root, '.gitleaks.toml'),
  '--gitleaks-ignore-path',
  emptyIgnore,
];
try {
  const files = snapshotSource(root, snapshot);
  console.log(`Scanning ${files.length} publishable files without path exclusions`);
  runTool('gitleaks', ['dir', snapshot, ...flags]);
  if (existsSync(join(root, '.git'))) {
    const hasHistory = (() => {
      try {
        execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
          cwd: root,
          windowsHide: true,
          stdio: 'ignore',
        });
        return true;
      } catch {
        return false;
      }
    })();
    if (hasHistory) runTool('gitleaks', ['git', '.', ...flags, '--log-opts=--all']);
    else console.log('No commits yet; history scanning starts after the initial commit.');
  }
} finally {
  for (const directory of [snapshot, emptyIgnore]) {
    rmSync(directory, { recursive: true, force: true });
  }
}
