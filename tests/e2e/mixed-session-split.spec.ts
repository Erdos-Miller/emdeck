import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { SessionSnapshot } from '../../src/shared/contracts/sessions';
import type { TerminalEvent } from '../../src/shared/contracts/workspace';
import { backgroundCalls, installBackgroundLayout } from './fixtures/background-layout';

const rail = (page: Page) => page.getByRole('complementary', { name: 'Terminal workspaces' });
const tabs = (page: Page) => page.getByRole('toolbar', { name: 'Session tabs' });
const split = (page: Page) => tabs(page).getByRole('button', { name: 'Split view', exact: true });
const visiblePanes = (page: Page) => page.locator('.terminal-pane:visible');
const backgroundJob = (page: Page, name: string) =>
  rail(page).getByTitle(`Focus ${name} on This computer`, { exact: true });

const setup = async (page: Page) => {
  await installBackgroundLayout(page);
  await page.evaluate(() => {
    const snapshot = (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
      .__layoutSnapshots.local;
    snapshot.workspaces = [
      { id: 'repo2', name: 'repo2', root: '/synthetic/repo2' },
      { id: 'repo3', name: 'repo3', root: '/synthetic/repo3' },
    ];
    for (const [index, pane] of snapshot.panes.entries()) {
      pane.title = `Background ${index + 1}`;
      pane.launch.workspaceId = snapshot.workspaces[index].id;
      pane.launch.cwd = snapshot.workspaces[index].root;
    }
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await rail(page).getByRole('button', { name: 'Background machines', exact: true }).click();
  await page.getByRole('button', { name: 'Connect local server', exact: true }).click();
  await page.getByRole('button', { name: /Back to sessions/ }).click();
  for (let id = 0; id < 3; id++) {
    await page.getByRole('button', { name: 'New terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Claude Claude Code' }).click();
    await expect(page.locator('.terminal-pane')).toHaveCount(id + 1);
    await page.evaluate(id => {
      const state = window as unknown as {
        __emdeckEmitTerminal: (id: string, event: TerminalEvent) => void;
      };
      state.__emdeckEmitTerminal(`pty-${id}`, {
        type: 'data',
        data: [...new TextEncoder().encode(`\x1b]2;Local ${id + 1}\x07`)],
      });
    }, id);
    await expect(rail(page).getByTitle(`Focus Local ${id + 1}`, { exact: true })).toBeVisible();
  }
  await expect(rail(page).locator('.rail-session')).toHaveCount(5);
  expect(
    (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.attach')
  ).toHaveLength(0);
};

test('Split view restores three local and two background sessions after selecting any session', async ({
  page,
}, testInfo) => {
  await setup(page);
  await backgroundJob(page, 'Background 1').click();
  await backgroundJob(page, 'Background 2').click();
  await split(page).click();
  await expect(visiblePanes(page)).toHaveCount(5);
  await expect(tabs(page).getByRole('button')).toHaveCount(6);
  await page
    .locator('.xterm')
    .evaluateAll(elements =>
      elements.forEach(element => element.setAttribute('data-mixed-stable', 'yes'))
    );
  await rail(page).getByRole('button', { name: 'Hide workspace list', exact: true }).click();
  for (const name of [
    'Local 1',
    'Background 1 · Background',
    'Local 3',
    'Background 2 · Background',
  ]) {
    const tab = tabs(page).getByRole('button', { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    await expect(visiblePanes(page)).toHaveCount(1);
    await split(page).click();
    await expect(visiblePanes(page)).toHaveCount(5);
  }
  for (const layout of ['Side by side', 'Stacked', 'Grid']) {
    await backgroundJob(page, 'Background 2').click();
    await page.getByTitle(layout, { exact: true }).click();
    await expect(visiblePanes(page)).toHaveCount(5);
    const positions = await visiblePanes(page).evaluateAll(elements =>
      elements.map(element => {
        const bounds = element.getBoundingClientRect();
        return `${bounds.x},${bounds.y}`;
      })
    );
    expect(new Set(positions).size).toBe(5);
    for (const pane of await visiblePanes(page).all()) await expect(pane).toBeInViewport();
  }
  await page.screenshot({ path: testInfo.outputPath('five-mixed-sessions-grid.png') });
  await expect(page.locator('.xterm[data-mixed-stable="yes"]')).toHaveCount(5);
  const calls = await backgroundCalls(page);
  expect(calls.filter(({ action }) => action.method === 'pane.attach')).toHaveLength(2);
  expect(
    calls.filter(({ action }) =>
      ['pane.detach', 'pane.stop', 'pane.restart', 'pane.create'].includes(action.method)
    )
  ).toHaveLength(0);
  const localCalls = await page.evaluate(() =>
    (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls
      .filter(call => ['terminal_spawn', 'terminal_close'].includes(call.command))
      .map(call => call.command)
  );
  expect(localCalls).toEqual(Array(3).fill('terminal_spawn'));
});

test('session focus keeps an explicit workspace filter until selecting a session outside it', async ({
  page,
}) => {
  await setup(page);
  await rail(page)
    .getByRole('button', { name: /^All sessions/ })
    .click();
  for (const name of ['Background 1', 'Background 2']) await backgroundJob(page, name).click();
  await split(page).click();
  await expect(visiblePanes(page)).toHaveCount(5);
  const backgroundSpace = rail(page).getByRole('button', { name: /^repo2 This computer/ });
  await backgroundSpace.click();
  await backgroundJob(page, 'Background 1').click();
  await split(page).click();
  await expect(backgroundSpace).toHaveClass(/active/);
  await expect(visiblePanes(page)).toHaveCount(1);
  await backgroundJob(page, 'Background 2').click();
  await split(page).click();
  await expect(visiblePanes(page)).toHaveCount(5);
  const localSpace = rail(page).getByRole('button', { name: /^first Project root/ });
  await localSpace.click();
  await rail(page).getByTitle('Focus Local 2', { exact: true }).click();
  await split(page).click();
  await expect(localSpace).toHaveClass(/active/);
  await expect(visiblePanes(page)).toHaveCount(3);
  await backgroundSpace.click();
  await rail(page).getByTitle('Focus Local 2', { exact: true }).click();
  await split(page).click();
  await expect(visiblePanes(page)).toHaveCount(5);
});
