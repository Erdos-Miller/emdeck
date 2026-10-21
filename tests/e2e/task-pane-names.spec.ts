import { expect, test } from './fixtures/desktop';
import type { Locator, Page } from '@playwright/test';
import type { SessionSnapshot } from '../../src/shared/contracts/sessions';
import { backgroundCalls, openBackgroundPanes } from './fixtures/background-layout';

const names = [
  'Buildkite environment hook errors and retry investigation',
  'Production database disk usage and retention cleanup',
  'Review spreadsheet import and customer follow-up changes',
  'Fix workflow retries and add regression coverage',
  'Investigate statement timeouts during database migration',
  'Resolve merge conflicts and rerun pull request checks',
  'Archive old runtime records and update migration notes',
  'Adjust image rendering and verify keyboard navigation',
  'VerifyBackgroundWorkerConfigurationWithoutWordSeparators'.repeat(3),
];

const expectReadableHeader = async (pane: Locator) => {
  await pane.scrollIntoViewIfNeeded();
  const title = pane.locator('.pane-title-text');
  const controls = pane.locator('.pane-controls');
  await expect(title).toBeVisible();
  const bounds = (await pane.boundingBox())!;
  const titleBounds = (await title.boundingBox())!;
  const controlBounds = (await controls.boundingBox())!;
  expect(titleBounds.width).toBeGreaterThan(bounds.width * 0.75);
  expect(titleBounds.height).toBeGreaterThan(15);
  expect(titleBounds.height).toBeLessThan(35);
  expect(controlBounds.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height);
  for (const button of await controls.getByRole('button').all()) {
    const buttonBounds = (await button.boundingBox())!;
    expect(buttonBounds.x).toBeGreaterThanOrEqual(bounds.x);
    expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    await expect(button).toBeInViewport({ ratio: 1 });
  }
  // The first letter must stay inside the label, rather than losing the start
  // of a centered flex text node when a long name is clipped.
  expect(
    await title.evaluate(element => {
      const range = document.createRange();
      range.setStart(element.firstChild!, 0);
      range.setEnd(element.firstChild!, 1);
      return range.getBoundingClientRect().left >= element.getBoundingClientRect().left;
    })
  ).toBe(true);
};

const localCalls = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls
      .filter(call => ['terminal_spawn', 'terminal_close'].includes(call.command))
      .map(call => call.command)
  );

test('nine tasks keep readable names, reachable controls and the same terminals across layouts', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 2800, height: 1100 });
  for (const [index, name] of names.entries()) {
    await page.getByRole('button', { name: 'New terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Terminal Your default shell', exact: true }).click();
    await expect.poll(async () => (await localCalls(page)).length).toBe(index + 1);
    await page.evaluate(
      ({ index, name }) => {
        const state = window as unknown as {
          __emdeckEmitTerminal: (id: string, event: unknown) => void;
        };
        state.__emdeckEmitTerminal(`pty-${index}`, {
          type: 'data',
          data: Array.from(new TextEncoder().encode(`\x1b]2;${name}\x07`)),
        });
      },
      { index, name }
    );
    await expect(page.locator('.terminal-pane').nth(index).locator('.pane-title')).toHaveText(name);
  }
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Side by side', { exact: true }).click();
  const panes = page.locator('.terminal-pane:visible');
  await expect(panes).toHaveCount(9);
  await panes
    .locator('.xterm')
    .evaluateAll(elements =>
      elements.forEach(element => element.setAttribute('data-task-name-retained', 'true'))
    );
  for (const pane of await panes.all()) await expectReadableHeader(pane);
  expect((await panes.first().locator('.pane-title-text').boundingBox())!.height).toBeGreaterThan(
    25
  );
  const tabs = page.getByRole('toolbar', { name: 'Session tabs' });
  const longTab = tabs.getByRole('button', { name: names[8], exact: true });
  await longTab.scrollIntoViewIfNeeded();
  await expect(longTab).toHaveAttribute('title', `${names[8]} — double-click to rename`);
  expect(
    await longTab.locator('.session-tab-name').evaluate(element => {
      const range = document.createRange();
      range.setStart(element.firstChild!, 0);
      range.setEnd(element.firstChild!, 1);
      return (
        element.scrollWidth > element.clientWidth &&
        range.getBoundingClientRect().left >= element.getBoundingClientRect().left &&
        element.getBoundingClientRect().right <=
          element.parentElement!.getBoundingClientRect().right
      );
    })
  ).toBe(true);
  await tabs.getByRole('button', { name: 'Split view', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('nine-task-names-dark.png') });
  await panes.first().getByTitle('Maximize pane', { exact: true }).click();
  await expect(panes).toHaveCount(1);
  expect((await panes.first().locator('.pane-header').boundingBox())!.height).toBe(31);
  await panes.first().getByTitle('Restore pane', { exact: true }).click();
  await expect(panes).toHaveCount(9);
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('nine-task-names-light.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectReadableHeader(panes.first());
  const rename = panes.first().getByRole('button', { name: `Rename ${names[0]} terminal` });
  await rename.focus();
  await rename.press('Enter');
  await page.getByLabel('Session name').fill('Build pipeline follow-up');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(panes.first().locator('.pane-title')).toHaveText('Build pipeline follow-up');
  await expect(page.locator('.xterm[data-task-name-retained="true"]')).toHaveCount(9);
  expect(await localCalls(page)).toEqual(Array(9).fill('terminal_spawn'));
});

test('background task names use the same narrow header without reattaching sessions', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1650, height: 1050 });
  await openBackgroundPanes(page);
  await page
    .getByRole('toolbar', { name: 'Background terminal layout' })
    .getByRole('button', { name: 'Side by side', exact: true })
    .click();
  await page.evaluate(names => {
    const snapshots = (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
      .__layoutSnapshots;
    Object.values(snapshots).forEach((snapshot, index) => {
      snapshot.panes.forEach((pane, paneIndex) => {
        pane.title = names[index * 2 + paneIndex];
      });
      snapshot.revision++;
    });
  }, names);
  const panes = page.locator('.session-terminal:visible');
  await expect(panes.first().locator('.pane-title-text')).toHaveText(names[0]);
  await panes
    .locator('.xterm')
    .evaluateAll(elements =>
      elements.forEach(element => element.setAttribute('data-task-name-retained', 'true'))
    );
  for (const pane of await panes.all()) await expectReadableHeader(pane);
  await page.screenshot({ path: testInfo.outputPath('background-task-names.png') });
  await panes.first().getByTitle('Maximize or restore session').click();
  await expect(panes).toHaveCount(1);
  await panes.first().getByTitle('Maximize or restore session').click();
  await expect(panes).toHaveCount(4);
  await expect(page.locator('.xterm[data-task-name-retained="true"]')).toHaveCount(4);
  const calls = await backgroundCalls(page);
  expect(calls.filter(({ action }) => action.method === 'pane.attach')).toHaveLength(4);
  expect(
    calls.filter(({ action }) =>
      ['pane.detach', 'pane.stop', 'pane.restart'].includes(action.method)
    )
  ).toHaveLength(0);
});
