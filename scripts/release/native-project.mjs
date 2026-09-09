import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';

// All commands and Git mutations stay inside a newly created synthetic fixture.
export const prepareProject = (project, directory) => {
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'emdeck-native-fixture',
      private: true,
      packageManager: 'bun@1.3.6',
      scripts: { verify: 'bun verify.ts' },
    })
  );
  writeFileSync(
    join(project, 'verify.ts'),
    "await Bun.write('run-complete.txt', 'native run passed');\n"
  );
  writeFileSync(join(project, '.gitignore'), 'run-complete.txt\n');
  const hooks = join(directory, 'empty-hooks');
  mkdirSync(hooks);
  const git = args => execFileSync('git', args, { cwd: project, windowsHide: true, stdio: 'pipe' });
  git(['init', '--initial-branch=main', `--template=${hooks}`]);
  git(['config', 'core.hooksPath', hooks]);
  git(['config', 'user.name', 'Emdeck Test']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'commit.gpgSign', 'false']);
  git(['add', '.']);
  git(['commit', '-m', 'Synthetic fixture']);
};

export const verifyNativeProject = async (page, project, directory) => {
  await page.getByRole('treeitem', { name: /demo.ts/ }).click();
  const editor = page.getByTestId('code-editor').locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('// keep this unsaved edit\n');
  await expect(editor).toContainText('keep this unsaved edit');
  writeFileSync(join(project, 'demo.ts'), '// external writer\n');
  await page.keyboard.press('Control+s');
  await expect(page.getByText(/EXTERNAL_CHANGE:/)).toBeVisible();
  expect(readFileSync(join(project, 'demo.ts'), 'utf8')).toBe('// external writer\n');
  await expect(editor).toContainText('keep this unsaved edit');
  await page.getByTitle('Reload current file', { exact: true }).click();
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(editor).toContainText('external writer');
  await expect(page.getByLabel('Unsaved', { exact: true })).toHaveCount(0);

  await page.getByTitle('Source control', { exact: true }).click();
  await page.getByTitle('Refresh Git', { exact: true }).click();
  await page.locator('.git-content .change-file[title="demo.ts"]').click();
  await expect(
    page.getByRole('region', { name: 'Working diff: demo.ts', exact: true })
  ).toContainText('+// external writer');
  await expect(page.getByRole('tab', { name: 'demo.ts Working', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page.getByRole('button', { name: 'Manage worktrees…' }).click();
  await page.getByRole('button', { name: 'New worktree', exact: true }).click();
  await page.getByLabel('New branch name', { exact: true }).fill('native/validation');
  const worktree = join(directory, 'worktree');
  await page.getByRole('textbox', { name: 'Destination folder' }).fill(worktree);
  await page.getByRole('checkbox', { name: 'Open in a new window after creating' }).uncheck();
  await page.getByRole('button', { name: 'Create worktree', exact: true }).click();
  const item = page.getByRole('article').filter({ hasText: 'native/validation' });
  await expect(item).toBeVisible();
  expect(existsSync(join(worktree, '.git'))).toBe(true);
  expect(readFileSync(join(worktree, 'demo.ts'), 'utf8')).toContain('Hello from Emdeck');
  const opened = page.context().waitForEvent('page');
  await item.getByRole('button', { name: 'Open in new window' }).click();
  const second = await opened;
  await expect(second.getByRole('tree', { name: 'Project files' })).toBeVisible();
  await expect(second.locator('.project-switch')).toContainText('worktree');
  await expect(page.locator('.project-switch')).toContainText('project');
  await second
    .evaluate(() =>
      window.__TAURI_INTERNALS__.invoke('plugin:window|close', {
        label: window.__TAURI_INTERNALS__.metadata.currentWindow.label,
      })
    )
    .catch(error => {
      if (!/closed|disconnected/i.test(error.message)) throw error;
    });
  await expect.poll(() => second.isClosed()).toBe(true);
  await page.getByTitle('Refresh worktrees', { exact: true }).click();
  await item.getByRole('button', { name: 'Remove…' }).click();
  await page.getByRole('button', { name: 'Remove worktree', exact: true }).click();
  await expect(item).toHaveCount(0);
  expect(existsSync(worktree)).toBe(false);

  await page.getByTitle('Manage run configurations', { exact: true }).click();
  const detected = page.getByRole('region', { name: 'Detected scripts', exact: true });
  await expect(detected).toContainText('bun run verify');
  expect(existsSync(join(project, 'run-complete.txt'))).toBe(false);
  await detected.getByTitle('Run bun verify', { exact: true }).click();
  await expect
    .poll(() => existsSync(join(project, 'run-complete.txt')), { timeout: 15000 })
    .toBe(true);
  expect(readFileSync(join(project, 'run-complete.txt'), 'utf8')).toBe('native run passed');
  await expect(page.locator('.terminal-pane')).toContainText('Exited');
  await page
    .locator('.terminal-pane')
    .getByTitle(/^Close /)
    .click();
  await expect(page.locator('.terminal-pane')).toHaveCount(0);
  console.log(
    'Native project passed: external-write protection, Git diff tab, independent project windows, worktree creation/removal, and a detected Bun command.'
  );
};
