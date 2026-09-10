import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';

// Exercise painted scrollbars as well as scroll geometry in the desktop webview's engine.
test.use({
  launchOptions: {
    channel: process.platform === 'win32' ? 'msedge' : 'chromium',
    ignoreDefaultArgs: ['--hide-scrollbars'],
  },
});

const openWelcome = async (page: Page, theme = 'dark', recentCount = 8) => {
  await page.evaluate(
    ({ theme, recentCount }) => {
      localStorage.setItem('test:startup', 'null');
      localStorage.setItem('relay:settings', JSON.stringify({ theme, reopenLastProject: false }));
      localStorage.setItem('relay:terminal-height', '500');
      localStorage.setItem(
        'relay:recent',
        JSON.stringify(
          Array.from({ length: recentCount }, (_, index) => ({
            root: `/projects/workspace-${index + 1}`,
            name: `workspace-${index + 1}`,
          }))
        )
      );
    },
    { theme, recentCount }
  );
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('Open workspace');
  await expect(page.locator('.welcome')).toBeVisible();
};

const thumbColor = (page: Page) =>
  page
    .locator('.welcome')
    .evaluate(element => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor);

const scrollMetrics = (page: Page) =>
  page.locator('.welcome').evaluate(element => ({
    width: element.clientWidth,
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    top: element.scrollTop,
  }));

const scrollbarImage = async (page: Page) => {
  const bounds = (await page.locator('.welcome').boundingBox())!;
  return page.screenshot({
    clip: { x: bounds.x + bounds.width - 7, y: bounds.y, width: 7, height: bounds.height },
    animations: 'disabled',
  });
};

test('a short Welcome pane keeps the beginning and end reachable with recent workspaces', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await openWelcome(page);
  const welcome = page.locator('.welcome');
  const bounds = (await welcome.boundingBox())!;
  const documentBounds = (await page.locator('.file-document').boundingBox())!;
  expect(bounds.height).toBeLessThan(280);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(documentBounds.y + documentBounds.height);
  await expect(page.locator('.welcome-eyebrow')).toBeInViewport({ ratio: 1 });

  await welcome.hover({ position: { x: 30, y: 30 } });
  await page.mouse.wheel(0, 10000);
  await expect(page.locator('.welcome-principles')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('welcome-short-bottom.png') });
  await page.mouse.wheel(0, -10000);
  await expect(page.locator('.welcome-eyebrow')).toBeInViewport({ ratio: 1 });
  await expect.poll(async () => (await scrollMetrics(page)).top).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('welcome-short-top.png') });

  // Keyboard navigation must also reveal recent entries inside this small scroll container.
  const lastWorkspace = welcome.getByRole('button', { name: /workspace-8/ });
  await lastWorkspace.focus();
  await expect(lastWorkspace).toBeInViewport({ ratio: 1 });
  await lastWorkspace.press('Enter');
  await expect(page.locator('.project-switch')).toContainText('workspace-8');
});

test('Welcome stays centered when it fits and scrolls after resizing the terminal panel', async ({
  page,
}) => {
  await openWelcome(page, 'dark', 0);
  await page.setViewportSize({ width: 1440, height: 1200 });
  const metrics = await scrollMetrics(page);
  expect(metrics.scrollHeight).toBe(metrics.height);
  const bounds = (await page.locator('.welcome').boundingBox())!;
  const first = (await page.locator('.welcome-eyebrow').boundingBox())!;
  const last = (await page.locator('.welcome-principles').boundingBox())!;
  expect(
    Math.abs(first.y - bounds.y - (bounds.y + bounds.height - last.y - last.height))
  ).toBeLessThan(2);

  const divider = page.getByRole('separator', { name: 'Resize terminal panel', exact: true });
  await divider.focus();
  await divider.press('End');
  const resized = await scrollMetrics(page);
  expect(resized.scrollHeight).toBeGreaterThan(resized.height);
  await page.setViewportSize({ width: 900, height: 640 });
  await expect(page.locator('.welcome-eyebrow')).toBeInViewport({ ratio: 1 });
  await page.locator('.welcome').hover({ position: { x: 30, y: 30 } });
  await page.mouse.wheel(0, 10000);
  await expect(page.locator('.welcome-principles')).toBeInViewport({ ratio: 1 });
});

for (const theme of ['dark', 'light', 'graphite']) {
  test(`Welcome scrollbar appears only on hover with overflow in the ${theme} theme`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 640 });
    await openWelcome(page, theme);
    await page.locator('.topbar').hover({ position: { x: 10, y: 10 } });
    const before = await scrollMetrics(page);
    expect(before.scrollHeight).toBeGreaterThan(before.height);
    await expect.poll(() => thumbColor(page)).toBe('rgba(0, 0, 0, 0)');
    const hiddenScrollbar = await scrollbarImage(page);

    await page.locator('.welcome').hover({ position: { x: 30, y: 30 } });
    await expect.poll(() => thumbColor(page)).not.toBe('rgba(0, 0, 0, 0)');
    expect((await scrollbarImage(page)).equals(hiddenScrollbar)).toBe(false);
    expect(await scrollMetrics(page)).toEqual(before);

    await page.locator('.sidebar').hover({ position: { x: 20, y: 20 } });
    await expect.poll(() => thumbColor(page)).toBe('rgba(0, 0, 0, 0)');
    expect((await scrollbarImage(page)).equals(hiddenScrollbar)).toBe(true);

    await page.getByTitle('Hide terminals (sessions keep running)').click();
    await page.setViewportSize({ width: 1440, height: 1200 });
    const expanded = await scrollMetrics(page);
    expect(expanded.scrollHeight).toBe(expanded.height);
    await page.locator('.topbar').hover({ position: { x: 10, y: 10 } });
    const noOverflow = await scrollbarImage(page);
    await page.locator('.welcome').hover({ position: { x: 30, y: 30 } });
    expect((await scrollbarImage(page)).equals(noOverflow)).toBe(true);
    expect(await scrollMetrics(page)).toEqual(expanded);
  });
}
