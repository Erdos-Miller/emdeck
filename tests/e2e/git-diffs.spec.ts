import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
async function openDiffFixture(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as Record<string, unknown>;
    state.__emdeckGit = {
      available: true,
      message: '',
      branch: 'main',
      localBranches: ['main'],
      remoteBranches: [],
      commits: [],
      changes: [
        { path: 'notes.ts', index: 'M', working: 'M', conflict: false, originalPath: null },
        { path: 'src/other.ts', index: ' ', working: 'M', conflict: false, originalPath: null },
        { path: 'removed.ts', index: ' ', working: 'D', conflict: false, originalPath: null },
      ],
    };
    state.__emdeckDiffs = {
      'working:notes.ts':
        'diff --git a/notes.ts b/notes.ts\n--- a/notes.ts\n+++ b/notes.ts\n@@ -1 +1 @@\n-const saved = true;\n+const changed = true;\n' +
        Array.from({ length: 80 }, (_, i) => ` context line ${i}`).join('\n'),
      'staged:notes.ts':
        'diff --git a/notes.ts b/notes.ts\n@@ -1 +1 @@\n-const original = true;\n+const staged = true;\n',
      'working:src/other.ts':
        'diff --git a/src/other.ts b/src/other.ts\n@@ -1 +1 @@\n-old value\n+another file\n',
      'working:removed.ts':
        'diff --git a/removed.ts b/removed.ts\ndeleted file mode 100644\n-removed contents\n',
    };
  });
  await page.getByTitle('Source control', { exact: true }).click();
  await page.getByTitle('Refresh Git', { exact: true }).click();
  await expect(page.locator('.git-content .change-file')).toHaveCount(4);
}
test('Git diffs open in reusable staged and working tabs while edits and terminals remain intact', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  const editor = page.getByTestId('code-editor');
  await editor.evaluate(el => el.setAttribute('data-editor-marker', 'kept'));
  await editor.locator('.cm-content').click();
  await page.keyboard.insertText('// unsaved draft\n');
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Terminal Your default shell' }).click();
  const terminal = page.getByRole('region', { name: 'Terminal terminal' }).locator('.xterm');
  await expect(terminal).toBeVisible();
  await terminal.evaluate(el => el.setAttribute('data-terminal-marker', 'kept'));
  await openDiffFixture(page);
  const notes = page.locator('.git-content .change-file[title="notes.ts"]');
  await notes.last().click();
  const working = page.getByRole('region', { name: 'Working diff: notes.ts', exact: true });
  await expect(working).toContainText('+const changed = true;');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(editor).toBeHidden();
  await expect(page.getByTitle('Save current file', { exact: true })).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+s');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls.filter(
        call => call.command === 'save_file'
      )
    )
  ).toEqual([]);
  await working.locator('.diff-view').evaluate(el => {
    el.scrollTop = 250;
  });
  await notes.first().click();
  await expect(
    page.getByRole('region', { name: 'Staged diff: notes.ts', exact: true })
  ).toContainText('+const staged = true;');
  await notes.last().click();
  await expect(page.getByRole('tab', { name: 'notes.ts Working', exact: true })).toHaveCount(1);
  expect(await working.locator('.diff-view').evaluate(el => el.scrollTop)).toBe(250);
  await page.locator('.git-content .change-file[title="src/other.ts"]').click();
  await expect(
    page.getByRole('region', { name: 'Working diff: src/other.ts', exact: true })
  ).toContainText('+another file');
  await page.getByRole('tab', { name: 'notes.ts Working', exact: true }).click();
  await working.locator('.diff-view').evaluate(el => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: 'test-results/git-diff-tabs-dark.png' });
  await page.getByRole('button', { name: 'Open in editor', exact: true }).click();
  await expect(editor).toHaveAttribute('data-editor-marker', 'kept');
  await expect(editor).toContainText('unsaved draft');
  await expect(terminal).toHaveAttribute('data-terminal-marker', 'kept');
  await page.getByRole('tab', { name: 'notes.ts Working', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+w');
  await expect(page.getByRole('tab', { name: 'notes.ts Working', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('diff tabs refresh after Git changes, show errors with retry, and support deleted files', async ({
  page,
}) => {
  await openDiffFixture(page);
  await page.locator('.git-content .change-file[title="notes.ts"]').last().click();
  const diff = page.getByRole('region', { name: 'Working diff: notes.ts', exact: true });
  await expect(diff).toContainText('+const changed = true;');
  await page.evaluate(() => {
    (window as unknown as { __emdeckDiffs: Record<string, string> }).__emdeckDiffs[
      'working:notes.ts'
    ] = '+Updated on disk';
  });
  await page.getByTitle('Refresh Git', { exact: true }).click();
  await expect(diff).toContainText('+Updated on disk');
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckDiffError = true;
  });
  await page.getByTitle('Refresh diff', { exact: true }).click();
  await expect(diff.getByRole('alert')).toContainText('Could not read this diff');
  await page.evaluate(() => {
    const state = window as unknown as {
      __emdeckDiffError: boolean;
      __emdeckDiffs: Record<string, string>;
    };
    state.__emdeckDiffError = false;
    state.__emdeckDiffs['working:notes.ts'] = '';
  });
  await diff.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(diff.getByRole('heading', { name: 'No text changes' })).toBeVisible();
  await page.locator('.git-content .change-file[title="removed.ts"]').click();
  await expect(
    page.getByRole('region', { name: 'Working diff: removed.ts', exact: true })
  ).toContainText('deleted file mode');
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.setViewportSize({ width: 900, height: 640 });
  await page.screenshot({ path: 'test-results/git-diff-tabs-light-small.png' });
  const box = (await page
    .getByRole('region', { name: 'Working diff: removed.ts', exact: true })
    .boundingBox())!;
  const panel = (await page.locator('.editor-panel').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height);
  await page.getByTitle('Projects', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Replace project in this window…' }).click();
  await expect(page.locator('.project-switch')).toContainText('second');
  await expect(page.locator('.diff-tab')).toHaveCount(0);
});
test('a closed pending diff cannot reopen a tab or steal focus when its response arrives', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /notes.ts/ }).click();
  await openDiffFixture(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckDelayDiff = 'src/other.ts';
  });
  await page.locator('.git-content .change-file[title="src/other.ts"]').click();
  await expect(
    page.getByRole('region', { name: 'Working diff: src/other.ts', exact: true })
  ).toContainText('Loading diff…');
  await page.keyboard.press('ControlOrMeta+w');
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __emdeckReleaseDiff: () => void }).__emdeckReleaseDiff();
  });
  await expect(page.locator('.diff-tab')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /notes.ts/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
});
