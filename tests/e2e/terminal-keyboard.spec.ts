import { expect, test } from './fixtures/desktop';
import { installTerminalClipboard } from './fixtures/terminal-clipboard';
import type { Page } from './fixtures/desktop';
import { actions, emit } from './fixtures/session';

const writes = async (page: Page) => (await actions(page, 'pane.input')).map(params => params.text);

test.beforeEach(async ({ page }) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Claude terminal' })).toBeVisible();
  await page.locator('.xterm-helper-textarea').focus();
});

test('paste keys reach native clipboard handling once, preserving multiline bracketed paste', async ({
  page,
}) => {
  await emit(page, 'pane-0', '\x1b[?2004hREADY');
  await expect(page.locator('.terminal-host')).toContainText('READY');
  const input = page.locator('.xterm-helper-textarea');
  await installTerminalClipboard(input);
  const expected: string[] = [];
  for (const shortcut of ['Control+v', 'Control+Shift+V', 'Meta+v', 'Shift+Insert']) {
    await page.keyboard.press(shortcut);
    await expect(input).toHaveAttribute('data-paste-allowed', 'true');
    expected.push('\x1b[200~first line\rsecond line\x1b[201~');
    await expect.poll(() => writes(page)).toEqual(expected);
  }
});

test('Shift+Enter is distinct from submit while interrupt, Ctrl+J and Alt+Enter remain intact', async ({
  page,
}) => {
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+j');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.press('Control+c');
  await expect.poll(() => writes(page)).toEqual(['\x1b[13;2u', '\r', '\n', '\x1b\r', '\x03']);
});

test('Ctrl+V retains image paste instead of falling back to text-only clipboard reads', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckAttachmentInput =
      "'C:/fixture/fixture.png' ";
  });
  await installTerminalClipboard(page.locator('.xterm-helper-textarea'), true);
  await page.keyboard.press('Control+v');
  await expect.poll(() => writes(page)).toEqual(["'C:/fixture/fixture.png' "]);
});
