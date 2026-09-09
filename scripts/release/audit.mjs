import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, runTool } from './tools.mjs';

execFileSync('bun', ['audit'], { cwd: root, windowsHide: true, stdio: 'inherit' });
runTool('gitleaks', ['dir', '.', '--redact', '--no-banner']);
if (existsSync(join(root, '.git'))) {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: root,
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    console.log(
      'No Git commits yet; source scan completed. History scan starts after the initial commit.'
    );
    process.exit(0);
  }
  runTool('gitleaks', ['git', '.', '--redact', '--no-banner', '--log-opts=--all']);
}
