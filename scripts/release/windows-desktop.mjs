// Tests the real packaged WebView and native IPC, using an isolated profile.
// CDP is enabled only in this test process, following playwright.dev/docs/webview2.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { root } from './tools.mjs';

if (process.platform !== 'win32') throw new Error('This test targets Windows WebView2.');
const executable = resolve(process.argv[2] ?? '');
if (!executable.endsWith('emdeck-ide.exe')) throw new Error('Pass the Emdeck executable.');
const directory = mkdtempSync(join(root, '.tmp/desktop-test-'));
writeFileSync(join(directory, 'README.md'), '# Native desktop review\n\nLocal Markdown preview.\n');
writeFileSync(join(directory, 'demo.ts'), "export const greeting = 'Hello from Emdeck';\n");
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const app = spawn(executable, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: join(directory, 'profile'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`,
  },
});
let processError;
app.on('error', error => {
  processError = error;
});
let browser;
let page;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (processError) throw processError;
    if (app.exitCode !== null) throw new Error(`Application exited: ${app.exitCode}`);
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      break;
    } catch {
      await delay(1000);
    }
  }
  if (!browser) throw new Error('Native WebView did not start.');
  const context = browser.contexts()[0];
  page = context.pages()[0] ?? (await context.waitForEvent('page'));
  page.setDefaultTimeout(15000);
  await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Seed only the isolated profile's remembered project; startup uses real IPC.
  await page.evaluate(
    path =>
      localStorage.setItem(
        'relay:last-project',
        JSON.stringify({ root: path, name: 'Desktop test' })
      ),
    directory
  );
  await page.reload();
  await expect(page.getByRole('tree', { name: 'Project files' })).toBeVisible();
  await page.getByRole('treeitem', { name: /demo.ts/ }).click();
  const editor = page.getByTestId('code-editor').locator('.cm-content');
  await expect(editor).toContainText('Hello from Emdeck');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('// Native save verified\n');
  await page.keyboard.press('Control+s');
  await expect
    .poll(() => readFileSync(join(directory, 'demo.ts'), 'utf8'))
    .toContain('Native save verified');
  await page.getByRole('treeitem', { name: /README.md/ }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Native desktop review' })).toBeVisible();
  for (let index = 0; index < 6; index++) {
    await page.getByRole('button', { name: 'New terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Terminal Your default shell', exact: true }).click();
  }
  const terminals = page.locator('.terminal-pane');
  await expect(terminals).toHaveCount(6);
  await expect.poll(() => page.locator('.terminal-pane .xterm').count()).toBe(6);
  await expect
    .poll(() => page.locator('.terminal-pane').filter({ hasText: 'Connected' }).count())
    .toBe(6);
  await page
    .locator('.terminal-pane .xterm')
    .first()
    .evaluate(element => (element.dataset.nativeTest = 'preserved'));
  await page.getByTitle('Grid', { exact: true }).click();
  await page.getByTitle('Full-width terminal panel', { exact: true }).click();
  await page.getByTitle('Hide terminals (sessions keep running)').click();
  await page.getByTitle('Toggle terminal panel', { exact: true }).click();
  await expect(page.locator('.xterm[data-native-test="preserved"]')).toHaveCount(1);
  await page.screenshot({ path: join(directory, 'native-six-terminals.png') });
  if (process.env.EMDECK_MEASURE_SECONDS) {
    const seconds = Number(process.env.EMDECK_MEASURE_SECONDS);
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600)
      throw new Error('Measurement must be 10–600 seconds.');
    execFileSync(
      'pwsh',
      [
        '-NoProfile',
        '-File',
        join(root, 'scripts/release/measure-windows.ps1'),
        '-AppProcessId',
        String(app.pid),
        '-Seconds',
        String(seconds),
        '-OutputPath',
        join(directory, 'six-terminal-performance.json'),
      ],
      { windowsHide: true, stdio: 'inherit' }
    );
  }
  for (let index = 0; index < 6; index++) {
    await page
      .locator('.terminal-pane')
      .first()
      .getByTitle(/^Close /)
      .click();
    await page.getByRole('button', { name: 'Close terminal', exact: true }).click();
    await expect(terminals).toHaveCount(5 - index);
  }
  await expect(terminals).toHaveCount(0);
  if (errors.length) throw new Error(`Native renderer errors: ${errors.join('; ')}`);
  await page
    .evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }))
    .catch(error => {
      if (!/closed|disconnected/i.test(error.message)) throw error;
    });
  for (let attempt = 0; app.exitCode === null && attempt < 40; attempt++) await delay(250);
  if (app.exitCode !== 0) throw new Error(`Application failed to close cleanly: ${app.exitCode}`);
  console.log(
    'Native desktop passed: project restore, file save, Markdown, six PTYs, layout preservation, and graceful close.'
  );
  console.log(`Isolated evidence: ${directory}`);
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app.exitCode === null) app.kill();
}
