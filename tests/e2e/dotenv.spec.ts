import { expect, test } from '@playwright/test';

const sample = '# Local settings\nexport APP_MODE=development\nLABEL="hello # world"\n';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(sample => {
    localStorage.setItem(
      'relay:demo-files',
      JSON.stringify({
        'src/app.ts': 'const original = true;\n',
        '.env': sample,
        '.env.local': sample,
        'staging.env': sample,
        'notes.txt': sample,
      })
    );
  }, sample);
  await page.goto('/');
});

test('environment file variants render distinct token colors in all themes', async ({
  page,
}, testInfo) => {
  const editor = page.getByTestId('code-editor');
  for (const theme of ['Dark', 'Light', 'Graphite']) {
    await page.getByTitle('Settings', { exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    for (const name of ['.env', '.env.local', 'staging.env']) {
      await page
        .getByRole('treeitem')
        .filter({ has: page.getByText(name, { exact: true }) })
        .click();
      const comment = editor.locator('.cm-line span').filter({ hasText: /^# Local settings$/ });
      const key = editor.locator('.cm-line span').filter({ hasText: /^APP_MODE$/ });
      const value = editor.locator('.cm-line span').filter({ hasText: /^development$/ });
      const keyword = editor.locator('.cm-line span').filter({ hasText: /^export$/ });
      const quoted = editor.locator('.cm-line span').filter({ hasText: /^"hello # world"$/ });
      await expect(key).toBeVisible();
      await expect(quoted).toBeVisible();
      await expect(page.locator('.statusbar')).toContainText('Dotenv');
      const colors = await Promise.all(
        [comment, key, value, keyword].map(token =>
          token.evaluate(el => getComputedStyle(el).color)
        )
      );
      expect(new Set(colors).size).toBe(4);
      expect(await quoted.evaluate(el => getComputedStyle(el).color)).toBe(colors[2]);
      expect(colors[2]).not.toBe(await editor.evaluate(el => getComputedStyle(el).color));
    }
    await page.screenshot({ path: testInfo.outputPath(`dotenv-${theme.toLowerCase()}.png`) });
  }
});

test('dotenv edits and undo survive theme and tab switches without coloring plain text', async ({
  page,
}) => {
  const editor = page.getByTestId('code-editor');
  const content = editor.locator('.cm-content');
  await page
    .getByRole('treeitem')
    .filter({ has: page.getByText('.env.local', { exact: true }) })
    .click();
  await expect(content).toContainText('APP_MODE');
  await content.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.insertText('EXTRA=changed\n');
  await expect(content).toContainText('EXTRA=changed');
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .getByRole('treeitem')
    .filter({ has: page.getByText('notes.txt', { exact: true }) })
    .click();
  await expect(content).not.toContainText('EXTRA');
  await expect(content.locator('.cm-line span')).toHaveCount(0);
  await expect(page.locator('.statusbar')).toContainText('Plain text');
  await page.getByRole('tab', { name: /.env.local/ }).click();
  await expect(content).toContainText('EXTRA=changed');
  await content.click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content).not.toContainText('EXTRA');
  await expect(content).toContainText('APP_MODE=development');
  await expect(content.locator('.cm-line span').filter({ hasText: /^APP_MODE$/ })).toBeVisible();
});
