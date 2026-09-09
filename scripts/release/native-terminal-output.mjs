import { expect } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

// A short native regression for streaming output, resize follow, and scrollback.
export const verifyStreamingTerminals = async page => {
  for (let index = 1; index <= 6; index++) {
    await page.getByRole('button', { name: 'New terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Custom command…', exact: true }).click();
    await page.getByLabel('Pane name', { exact: true }).fill(`Stream ${index}`);
    await page
      .getByLabel('Command', { exact: true })
      .fill(
        `$emdeckTick = 0; while ($true) { [Console]::WriteLine('STREAM_${index} ' + $emdeckTick); $emdeckTick++; Start-Sleep -Milliseconds 50 }`
      );
    await page.getByRole('button', { name: 'Launch terminal', exact: true }).click();
  }
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await page.getByTitle('Grid', { exact: true }).click();
  const ticks = async () => {
    const text = await page.locator('.terminal-pane .xterm-rows').allTextContents();
    return text.map((value, index) =>
      Math.max(
        -1,
        ...[...value.matchAll(new RegExp(`STREAM_${index + 1} (\\d+)`, 'g'))].map(match =>
          Number(match[1])
        )
      )
    );
  };
  await expect
    .poll(async () => (await ticks()).filter(value => value >= 10).length, { timeout: 15000 })
    .toBe(6);
  for (let iteration = 0; iteration < 3; iteration++) {
    const before = await ticks();
    await page.getByTitle('Stacked', { exact: true }).click();
    await page.getByTitle('Grid', { exact: true }).click();
    await expect
      .poll(async () => (await ticks()).every((value, index) => value > before[index] + 10), {
        timeout: 10000,
      })
      .toBe(true);
  }
  await delay(2000);
  const first = page.locator('.terminal-pane').first();
  const viewport = first.locator('.xterm-viewport');
  await first.locator('.xterm-screen').hover();
  await page.mouse.wheel(0, -100000);
  const inHistory = () =>
    viewport.evaluate(
      element => element.scrollTop + element.clientHeight < element.scrollHeight - 30
    );
  await expect.poll(inHistory).toBe(true);
  await page.getByTitle('Side by side', { exact: true }).click();
  await page.getByTitle('Grid', { exact: true }).click();
  await delay(300);
  expect(await inHistory()).toBe(true);
  for (let index = 0; index < 6; index++) {
    await page
      .locator('.terminal-pane')
      .first()
      .getByTitle(/^Close /)
      .click();
    await page.getByRole('button', { name: 'Close terminal', exact: true }).click();
    await expect(page.locator('.terminal-pane')).toHaveCount(5 - index);
  }
  await page.getByTitle('Restore editor', { exact: true }).click();
  console.log(
    'Native streaming passed: six live panes follow output through resizing and preserve deliberate scrollback.'
  );
};
