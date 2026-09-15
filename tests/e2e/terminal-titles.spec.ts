import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/desktop';
import { actions, emit as emitPane, exitPane } from './fixtures/session';

const emit = (page: Page, text: string) => emitPane(page, 'pane-0', text);

test('agent titles update headers, cards and workspace lists without restarting sessions', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code', exact: true }).click();
  const terminal = page.locator('.terminal-pane').first();
  await expect(terminal).toHaveAccessibleName('Claude terminal');
  await terminal
    .locator('.xterm')
    .evaluate(element => element.setAttribute('data-retained', 'true'));
  // OSC titles can be split across PTY reads, and can end with BEL or ST.
  await emit(page, '\x1b]2;Fix login');
  await emit(page, ' flow\x07');
  await expect(terminal).toHaveAccessibleName('Fix login flow terminal');
  await expect(terminal.locator('.pane-header strong')).toHaveText('Fix login flow');
  await expect(page.getByRole('article', { name: 'Fix login flow agent' })).toBeVisible();
  await page.getByLabel('Find agents').fill('login');
  await expect(page.getByRole('article', { name: 'Fix login flow agent' })).toBeVisible();
  await page.getByLabel('Find agents').clear();
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await expect(page.locator('.session-tabs')).toContainText('Fix login flow');
  await page.getByLabel('Find terminal sessions').fill('login');
  await expect(page.locator('.rail-sessions')).toContainText('Fix login flow');
  await page.getByLabel('Find terminal sessions').clear();
  await emit(page, '\x1b]0;Write regression tests\x1b\\');
  await expect(page.locator('.session-tabs')).toContainText('Write regression tests');
  await emit(page, '\x1b]1;Icon-only title\x07');
  await expect(terminal).toHaveAccessibleName('Write regression tests terminal');
  await page.getByLabel('Terminal view').selectOption('panes');
  await page.getByTitle('Rename Write regression tests', { exact: true }).click();
  await page.getByLabel('Session name').fill('Pinned task');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await emit(page, '\x1b]2;Agent changed its title\x07');
  await expect(terminal).toHaveAccessibleName('Pinned task terminal');
  await page.getByTitle('Rename Pinned task', { exact: true }).click();
  await page.getByLabel('Session name').clear();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(terminal).toHaveAccessibleName('Agent changed its title terminal');
  await emit(page, '\x1b]2;\x07');
  await expect(terminal).toHaveAccessibleName('Claude terminal');
  await expect(terminal.locator('.xterm')).toHaveAttribute('data-retained', 'true');
  expect(await actions(page, 'pane.create')).toHaveLength(1);
  expect(await actions(page, 'pane.remove')).toHaveLength(0);
});

test('long terminal titles stay readable without hiding pane controls and clear on restart', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Terminal Your default shell', exact: true }).click();
  const terminal = page.locator('.terminal-pane').first();
  await expect(terminal).toBeVisible();
  await page.setViewportSize({ width: 800, height: 600 });
  const title = 'Task '.repeat(70);
  await emit(page, `\x1b]2;${title}\x07`);
  await expect(terminal.locator('.pane-header strong')).toHaveText(title.slice(0, 200).trim());
  await expect(terminal.getByTitle('Maximize pane', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(terminal.locator('.pane-header button').last()).toBeInViewport({ ratio: 1 });
  await exitPane(page, 'pane-0', 0);
  await terminal.getByTitle('Restart terminal', { exact: true }).click();
  await expect(terminal).toHaveAccessibleName('Terminal terminal');
});
