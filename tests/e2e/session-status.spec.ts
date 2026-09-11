import { test, expect } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { TerminalEvent } from '../../src/shared/contracts/workspace';

const emit = async (page: Page, id: number, event: TerminalEvent) =>
  page.evaluate(
    ({ id, event }) => {
      (
        window as unknown as { __emdeckEmitTerminal: (id: string, event: TerminalEvent) => void }
      ).__emdeckEmitTerminal(`pty-${id}`, event);
    },
    { id, event }
  );

const screen = async (page: Page, id: number, text: string) =>
  emit(page, id, {
    type: 'data',
    data: [...new TextEncoder().encode(`\x1b[2J\x1b[H\x1b[999;1H${text}`)],
  });

const launch = async (page: Page, id: number, title: string) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code' }).click();
  await expect(page.locator('.terminal-pane')).toHaveCount(id + 1);
  await emit(page, id, {
    type: 'data',
    data: [...new TextEncoder().encode(`\x1b]2;${title}\x07`)],
  });
  await expect(page.getByRole('region', { name: `${title} terminal`, exact: true })).toBeVisible();
};

const setup = async (page: Page) => {
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByTitle('Expand terminals', { exact: true }).click();
  for (const [id, title] of ['Architecture', 'Permissions', 'Building', 'Review'].entries())
    await launch(page, id, title);
  await screen(
    page,
    0,
    'Which database should we use?\r\n❯ 1. SQLite\r\n  2. PostgreSQL\r\nEnter to select · Esc to cancel'
  );
  await screen(page, 1, 'Would you like to run this command?\r\n❯ 1. Yes\r\n  2. No');
  await screen(page, 2, 'Working...\r\nEsc to interrupt');
  await screen(page, 3, 'All requested changes are complete.\r\n›');
  const rail = page.getByRole('complementary', { name: 'Terminal workspaces' });
  await expect(rail.getByTitle('Focus Architecture', { exact: true })).toContainText(
    'Waiting for answer'
  );
  await expect(rail.getByTitle('Focus Permissions', { exact: true })).toContainText(
    'Needs approval'
  );
  await expect(rail.getByTitle('Focus Building', { exact: true })).toContainText('Working');
  await expect(rail.getByTitle('Focus Review', { exact: true })).toContainText('Ready');
  return rail;
};

for (const theme of ['Dark', 'Light', 'Graphite']) {
  test(`workspace statuses have distinct, readable badges in ${theme}`, async ({
    page,
  }, testInfo) => {
    const rail = await setup(page);
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.keyboard.press('Escape');
    const badges = rail.locator('.rail-status');
    const colors = await badges.evaluateAll(elements =>
      elements.map(element => {
        const style = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const luminance = (color: string) => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => {
            const normalized = value / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return {
          color: style.color,
          border: getComputedStyle(element.closest('button')!).borderLeftColor,
          contrast:
            (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
          fits:
            element.scrollWidth <= element.clientWidth &&
            element.scrollHeight <= element.clientHeight,
        };
      })
    );
    expect(new Set(colors.map(color => color.color)).size).toBe(4);
    for (const color of colors) {
      expect(color.contrast).toBeGreaterThanOrEqual(4.5);
      expect(color.border).toBe(color.color);
      expect(color.fits).toBe(true);
    }
    await expect(badges.locator('svg')).toHaveCount(4);
    await expect(rail.getByLabel('2 sessions need attention')).toBeVisible();
    await rail.screenshot({
      path: testInfo.outputPath(`session-status-${theme.toLowerCase()}.png`),
    });
  });
}

test('attention includes questions and approvals and clears when agents resume or exit without restarting terminals', async ({
  page,
}) => {
  const rail = await setup(page);
  await page
    .locator('.xterm')
    .evaluateAll(elements =>
      elements.forEach(element => element.setAttribute('data-preserved', 'yes'))
    );
  const attention = rail.getByRole('button', { name: 'Needs attention', exact: true });
  await attention.click();
  await expect(rail.locator('.rail-session')).toHaveCount(2);
  await rail.getByTitle('Focus Architecture', { exact: true }).click();
  const questionTerminal = page.getByRole('region', { name: 'Architecture terminal', exact: true });
  await expect(questionTerminal).toBeVisible();
  await expect(rail.getByTitle('Focus Architecture', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await screen(page, 0, 'Working...\r\nEsc to interrupt');
  await expect(rail.locator('.rail-session')).toHaveCount(1);
  await expect(questionTerminal).toBeVisible();
  await emit(page, 1, { type: 'exit', code: 0 });
  await expect(rail.locator('.rail-session')).toHaveCount(0);
  await expect(rail.getByLabel('0 sessions need attention')).toBeVisible();
  await attention.click();
  await screen(page, 0, 'What should I implement next?\r\n›');
  await expect(rail.getByTitle('Focus Architecture', { exact: true })).toContainText(
    'Waiting for answer'
  );
  await screen(page, 0, 'Implemented the changes.\r\n›');
  await expect(rail.getByTitle('Focus Architecture', { exact: true })).toContainText('Ready');
  await expect(rail.getByTitle('Focus Permissions', { exact: true })).toContainText('Exited');
  await expect(page.locator('.xterm[data-preserved="yes"]')).toHaveCount(4);
  const calls = await page.evaluate(
    () => (window as unknown as { __emdeckCalls: { command: string }[] }).__emdeckCalls
  );
  expect(calls.filter(call => call.command === 'terminal_spawn')).toHaveLength(4);
  expect(calls.filter(call => call.command === 'terminal_close')).toHaveLength(0);
});
