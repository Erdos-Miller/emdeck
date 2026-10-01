import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import {
  backgroundCalls,
  installBackgroundLayout,
  openBackgroundPanes,
} from './fixtures/background-layout';

const visible = (page: Page) => page.locator('.terminal-pane:visible');
const rail = (page: Page) => page.getByRole('complementary', { name: 'Terminal workspaces' });
const hiddenToggle = (page: Page, count: number) =>
  page.getByRole('button', { name: `Hidden sessions (${count})`, exact: true });
const hiddenList = (page: Page) =>
  page.getByRole('region', { name: 'Hidden sessions', exact: true });
const spawnLocal = async (page: Page, index: number) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code', exact: true }).click();
  await expect(page.locator('.terminal-pane:not(.session-terminal)')).toHaveCount(index + 1);
  await page.evaluate(index => {
    (
      window as unknown as { __emdeckEmitTerminal: (id: string, event: unknown) => void }
    ).__emdeckEmitTerminal(`pty-${index}`, {
      type: 'data',
      data: [...new TextEncoder().encode(`\x1b]2;Local ${index + 1}\x07keep this output\r\n`)],
    });
  }, index);
  await expect(
    page.getByRole('region', { name: `Local ${index + 1} terminal`, exact: true })
  ).toBeVisible();
};
const markTerminals = async (page: Page, count: number) => {
  await expect(page.locator('.xterm')).toHaveCount(count);
  await page
    .locator('.xterm')
    .evaluateAll(elements =>
      elements.forEach(element => element.setAttribute('data-visibility-stable', 'yes'))
    );
};
const expectNoLifecycleChanges = async (page: Page, local: number, attached: number) => {
  const calls = await backgroundCalls(page);
  expect(calls.filter(({ action }) => action.method === 'pane.attach')).toHaveLength(attached);
  expect(
    calls.filter(({ action }) =>
      ['pane.detach', 'pane.stop', 'pane.remove', 'pane.restart', 'pane.create'].includes(
        action.method
      )
    )
  ).toEqual([]);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls
        .filter(call => ['terminal_spawn', 'terminal_close'].includes(call.command))
        .map(call => call.command)
    )
  ).toEqual(Array(local).fill('terminal_spawn'));
};

test('hide and restore mixed sessions across filters, solo mode and terminal views without remounting', async ({
  page,
}, testInfo) => {
  await installBackgroundLayout(page);
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await rail(page).getByRole('button', { name: 'Background machines', exact: true }).click();
  await page.getByRole('button', { name: 'Connect local server', exact: true }).click();
  await page.getByRole('button', { name: /Back to sessions/ }).click();
  await spawnLocal(page, 0);
  await spawnLocal(page, 1);
  for (const name of ['claude local', 'codex local'])
    await rail(page).getByTitle(`Focus ${name} on This computer`, { exact: true }).click();
  const tabs = page.getByRole('toolbar', { name: 'Session tabs' });
  await tabs.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(visible(page)).toHaveCount(4);
  await markTerminals(page, 4);

  await tabs.getByRole('button', { name: 'Local 1', exact: true }).click();
  await expect(visible(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Hide Local 1', exact: true }).click();
  await expect(visible(page)).toHaveCount(3);
  await expect(hiddenToggle(page, 1)).toBeFocused();
  await expect(rail(page).getByTitle('Focus Local 1', { exact: true })).toHaveCount(0);
  await expect(tabs.getByRole('button', { name: 'Local 1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide claude local', exact: true }).click();
  await expect(visible(page)).toHaveCount(2);
  await expect(rail(page).locator('.rail-session')).toHaveCount(2);
  for (const layout of ['Side by side', 'Stacked', 'Grid']) {
    await page.getByTitle(layout, { exact: true }).click();
    await expect(visible(page)).toHaveCount(2);
  }
  await page.getByLabel('Terminal view').selectOption('panes');
  await expect(visible(page)).toHaveCount(1);
  await page.getByLabel('Terminal view').selectOption('server');
  await expect(visible(page)).toHaveCount(1);
  await hiddenToggle(page, 2).click();
  await hiddenList(page).getByRole('button', { name: 'Show Local 1', exact: true }).click();
  await expect(page.getByLabel('Terminal view')).toHaveValue('workspaces');
  await expect(visible(page)).toHaveCount(3);
  await expect(hiddenToggle(page, 1)).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('hidden-session-list.png') });
  await hiddenList(page).getByRole('button', { name: 'Show claude local', exact: true }).click();
  await expect(visible(page)).toHaveCount(4);
  await expect(page.locator('.xterm[data-visibility-stable="yes"]')).toHaveCount(4);
  await expect(page.locator('.terminal-pane:not(.session-terminal)').first()).toContainText(
    'keep this output'
  );
  await expectNoLifecycleChanges(page, 2, 2);
});

test('all hidden background sessions stay attached, retain arrangement and can be restored with keyboard or machine list', async ({
  page,
}) => {
  await openBackgroundPanes(page);
  await markTerminals(page, 4);
  const arrangement = await page.evaluate(() => localStorage.getItem('relay:session-layout'));
  for (const name of ['claude local', 'codex local', 'claude remote', 'codex remote']) {
    await page.getByRole('button', { name: `Hide ${name}`, exact: true }).focus();
    await page.keyboard.press('Enter');
  }
  await expect(visible(page)).toHaveCount(0);
  await expect(hiddenToggle(page, 4)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(hiddenList(page).getByRole('button', { name: /^Show / })).toHaveCount(5);
  await hiddenList(page).getByRole('button', { name: 'Show all sessions', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(visible(page)).toHaveCount(4);
  await expect(hiddenToggle(page, 0)).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('relay:session-layout'))).toBe(arrangement);
  await page.getByRole('button', { name: 'Hide claude remote', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Background machines and agents' })
    .getByRole('button', { name: /^claude remote/ })
    .click();
  await expect(visible(page)).toHaveCount(4);
  await expect(hiddenToggle(page, 0)).toBeVisible();
  await expect(page.locator('.xterm[data-visibility-stable="yes"]')).toHaveCount(4);
  await expectNoLifecycleChanges(page, 0, 4);
});

test('hidden sessions survive reload and are scoped to their project', async ({ page }) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await spawnLocal(page, 0);
  await page.getByRole('button', { name: 'Hide Local 1', exact: true }).click();
  await expect(hiddenToggle(page, 1)).toBeVisible();
  await page.reload();
  await expect(hiddenToggle(page, 1)).toBeVisible();
  await expect(visible(page)).toHaveCount(0);
  await hiddenToggle(page, 1).click();
  await expect(hiddenList(page).getByRole('button', { name: /^Show / })).toHaveCount(1);
  await page.evaluate(() =>
    localStorage.setItem('test:startup', JSON.stringify('/projects/second'))
  );
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('second');
  await expect(hiddenToggle(page, 0)).toBeVisible();
  await spawnLocal(page, 0);
  await expect(visible(page)).toHaveCount(1);
  await page.evaluate(() =>
    localStorage.setItem('test:startup', JSON.stringify('/projects/first'))
  );
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('first');
  await expect(hiddenToggle(page, 1)).toBeVisible();
  await hiddenToggle(page, 1).click();
  await hiddenList(page)
    .getByRole('button', { name: /^Show / })
    .click();
  await expect(visible(page)).toHaveCount(1);
  await expect(hiddenToggle(page, 0)).toBeVisible();
});
