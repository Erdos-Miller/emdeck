import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
async function worktreeFixture(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as Record<string, unknown>;
    const base = {
      head: 'abc123456',
      main: false,
      bare: false,
      current: false,
      open: false,
      missing: false,
      locked: null,
      prunable: null,
    };
    state.__emdeckWorktrees = [
      { ...base, path: '/projects/first', branch: 'main', main: true, current: true, open: true },
      { ...base, path: '/projects/first-agent', branch: 'agent/one' },
      { ...base, path: '/projects/first-locked', branch: 'agent/two', locked: 'In use elsewhere' },
      { ...base, path: '/projects/first-open', branch: 'agent/three', open: true },
      {
        ...base,
        path: '/projects/first-missing',
        branch: '',
        missing: true,
        prunable: 'Folder missing',
      },
    ];
    state.__emdeckGit = {
      available: true,
      message: '',
      branch: 'main',
      localBranches: ['main', 'agent/one', 'agent/two', 'agent/three', 'feature/available'],
      remoteBranches: ['origin/main'],
      changes: [],
      commits: [],
    };
  });
  await page.getByRole('button', { name: 'Manage branches', exact: true }).click();
  await page.getByTitle('Refresh branches', { exact: true }).click();
  await page.getByRole('button', { name: 'Manage worktrees…' }).click();
  await expect(page.getByRole('tab', { name: 'Worktrees', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByRole('article', { name: '/projects/first', exact: true })).toContainText(
    'This window'
  );
}
async function worktreeCalls(page: Page, command: string) {
  return page.evaluate(
    command =>
      (
        window as unknown as { __emdeckCalls: { command: string; args: Record<string, unknown> }[] }
      ).__emdeckCalls
        .filter(call => call.command === command)
        .map(call => call.args),
    command
  );
}
test('worktrees use a reusable tab, preserve dirty editors and open each folder in a new window', async ({
  page,
}) => {
  expect(await worktreeCalls(page, 'git_worktrees')).toEqual([]);
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  await page.getByTestId('code-editor').locator('.cm-content').click();
  await page.keyboard.type('// work in progress');
  await worktreeFixture(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const main = page.getByRole('article', { name: '/projects/first', exact: true });
  await expect(main.getByRole('button')).toHaveCount(0);
  await expect(
    page
      .getByRole('article', { name: '/projects/first-locked', exact: true })
      .getByRole('button', { name: 'Remove…' })
  ).toBeDisabled();
  await expect(
    page
      .getByRole('article', { name: '/projects/first-open', exact: true })
      .getByRole('button', { name: 'Remove…' })
  ).toBeDisabled();
  await expect(
    page.getByRole('article', { name: '/projects/first-missing', exact: true })
  ).toContainText('Detached HEAD');
  await page
    .getByRole('article', { name: '/projects/first-agent', exact: true })
    .getByRole('button', { name: 'Open in new window' })
    .click();
  expect(await worktreeCalls(page, 'open_project_window')).toEqual([
    { path: '/projects/first-agent' },
  ]);
  await expect(page.locator('.project-switch')).toContainText('first');
  await page.keyboard.press('ControlOrMeta+s');
  expect(await worktreeCalls(page, 'save_file')).toEqual([]);
  await page.getByRole('tab', { name: /notes\.ts/ }).click();
  await expect(page.getByTestId('code-editor')).toContainText('// work in progress');
  await worktreeFixture(page);
  await expect(page.getByRole('tab', { name: 'Worktrees', exact: true })).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+w');
  await expect(page.getByRole('tab', { name: 'Worktrees', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('code-editor')).toContainText('// work in progress');
});
test('new worktree uses an explicit remote starting branch and opens after successful creation', async ({
  page,
}) => {
  await worktreeFixture(page);
  await page.getByRole('button', { name: 'New worktree', exact: true }).click();
  await page.getByLabel('New branch name', { exact: true }).fill('agent/new-feature');
  await page
    .getByRole('combobox', { name: 'Start from', exact: true })
    .selectOption('refs/remotes/origin/main');
  await expect(page.getByRole('textbox', { name: 'Destination folder' })).toHaveValue(
    '/projects/first-agent-new-feature'
  );
  await page.getByRole('button', { name: 'Create worktree', exact: true }).click();
  await expect(
    page.getByRole('article', { name: '/projects/first-agent-new-feature', exact: true })
  ).toBeVisible();
  expect(await worktreeCalls(page, 'git_worktree_create')).toEqual([
    {
      root: '/projects/first',
      request: {
        path: '/projects/first-agent-new-feature',
        branch: 'agent/new-feature',
        newBranch: true,
        startPoint: 'refs/remotes/origin/main',
      },
    },
  ]);
  expect(await worktreeCalls(page, 'open_project_window')).toEqual([
    { path: '/projects/first-agent-new-feature' },
  ]);
  expect(await worktreeCalls(page, 'git_action')).toEqual([]);
});
test('existing worktree branch selection excludes occupied branches and creation can skip opening', async ({
  page,
}) => {
  await worktreeFixture(page);
  await page.getByRole('button', { name: 'New worktree', exact: true }).click();
  await page.getByRole('combobox', { name: 'Branch mode', exact: true }).selectOption('existing');
  await expect(
    page.getByRole('option', { name: 'main — already in a worktree', exact: true })
  ).toHaveJSProperty('disabled', true);
  await page
    .getByRole('combobox', { name: 'Local branch', exact: true })
    .selectOption('feature/available');
  await page.getByRole('textbox', { name: 'Destination folder' }).fill('/projects/custom folder');
  await page.getByRole('checkbox', { name: 'Open in a new window after creating' }).uncheck();
  await page.getByRole('button', { name: 'Create worktree', exact: true }).click();
  await expect(
    page.getByRole('article', { name: '/projects/custom folder', exact: true })
  ).toContainText('feature/available');
  expect(await worktreeCalls(page, 'open_project_window')).toEqual([]);
  expect(await worktreeCalls(page, 'git_worktree_create')).toEqual([
    {
      root: '/projects/first',
      request: {
        path: '/projects/custom folder',
        branch: 'feature/available',
        newBranch: false,
        startPoint: 'HEAD',
      },
    },
  ]);
  await page.screenshot({ path: '.tmp/worktrees-list.png' });
});
test('worktree removal requires confirmation and leaves a dirty worktree intact after a Git refusal', async ({
  page,
}) => {
  await worktreeFixture(page);
  const item = page.getByRole('article', { name: '/projects/first-agent', exact: true });
  await item.getByRole('button', { name: 'Remove…' }).click();
  await expect(page.getByRole('dialog')).toContainText('/projects/first-agent');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await worktreeCalls(page, 'git_worktree_remove')).toEqual([]);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckWorktreeRemoveError = true;
  });
  await item.getByRole('button', { name: 'Remove…' }).click();
  await page.getByRole('button', { name: 'Remove worktree', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('modified or untracked');
  await expect(item).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckWorktreeRemoveError = false;
  });
  await item.getByRole('button', { name: 'Remove…' }).click();
  await page.getByRole('button', { name: 'Remove worktree', exact: true }).click();
  await expect(item).toHaveCount(0);
  expect(await worktreeCalls(page, 'git_action')).toEqual([]);
});
test('worktree errors preserve the form, and failed new windows can be retried without recreating', async ({
  page,
}) => {
  await worktreeFixture(page);
  await page.getByRole('button', { name: 'New worktree', exact: true }).click();
  await page.getByLabel('New branch name', { exact: true }).fill('agent/retry');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckWorktreeCreateError = true;
  });
  await page.getByRole('button', { name: 'Create worktree', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Destination already exists');
  await expect(page.getByLabel('New branch name', { exact: true })).toHaveValue('agent/retry');
  expect(await worktreeCalls(page, 'open_project_window')).toEqual([]);
  await page.evaluate(() => {
    const state = window as unknown as Record<string, unknown>;
    state.__emdeckWorktreeCreateError = false;
    state.__emdeckWindowError = true;
  });
  await page.getByRole('button', { name: 'Create worktree', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Worktree created, but its window could not open'
  );
  const item = page.getByRole('article', { name: '/projects/first-agent-retry', exact: true });
  await expect(item).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckWindowError = false;
  });
  await item.getByRole('button', { name: 'Open in new window' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await worktreeCalls(page, 'git_worktree_create')).toHaveLength(2);
  await page.getByRole('button', { name: 'New worktree', exact: true }).click();
  await page.screenshot({ path: '.tmp/worktrees-dark.png' });
  await page.setViewportSize({ width: 900, height: 640 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await page.screenshot({ path: '.tmp/worktrees-light-small.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
