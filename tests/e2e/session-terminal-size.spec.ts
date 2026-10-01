import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { SessionAction, SessionSnapshot } from '../../src/shared/contracts/sessions';
import {
  backgroundCalls,
  backgroundPane,
  connectBackgroundLayout,
  installBackgroundLayout,
} from './fixtures/background-layout';

const installScreen = async (page: Page) => {
  await installBackgroundLayout(page);
  await page.evaluate(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      __layoutSnapshots: Record<string, SessionSnapshot>;
      __drawSession: () => void;
    };
    const original = state.__TAURI_INTERNALS__.invoke;
    const pane = state.__layoutSnapshots.local.panes[0];
    const initial = structuredClone(pane);
    let sequence = 1;
    // Cursor-relative output relies on autowrap occurring at the server's edge.
    const frame = (cols: number, label: string) =>
      `\x1b[2J\x1b[1;${cols}H#wrapped\r\x1b[2K${label}\x1b[4;1HREADY>`;
    let data = `\x1bc\x1b[?1049h${frame(initial.cols, 'RESTORED LEFT')}`;
    state.__drawSession = () => {
      sequence++;
      data = frame(pane.cols, 'LIVE LEFT');
    };
    state.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      const action = args.action as SessionAction | undefined;
      if (command !== 'session_request' || args.connection !== 'local')
        return original(command, args);
      if (action?.method === 'pane.resize') {
        // Match protocol 1's actual native limits, including older running servers.
        pane.cols = Math.max(10, Math.min(300, action.params.cols));
        pane.rows = Math.max(2, Math.min(120, action.params.rows));
      }
      if (action?.method !== 'pane.read' || action.params.id !== pane.id)
        return original(command, args);
      const reset = action.params.after === null;
      const result = {
        sequence,
        reset,
        data: reset || action.params.after !== sequence ? btoa(data) : '',
        text: '',
        pane: structuredClone(reset ? initial : pane),
      };
      await new Promise(resolve => setTimeout(resolve, 100));
      return result;
    };
  });
  await connectBackgroundLayout(page);
  await page
    .getByRole('complementary', { name: 'Background machines and agents' })
    .getByRole('button', { name: /^claude local/ })
    .click();
  await page.getByTitle('Expand terminals', { exact: true }).click();
  const terminal = backgroundPane(page, 'local/0');
  await expect(terminal.locator('.xterm-rows')).toContainText('READY>');
  return terminal;
};

test('restored terminal output is decoded at the saved screen size before fitting', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const terminal = await installScreen(page);
  await expect(terminal.locator('.xterm-rows > div').nth(1)).toHaveText('RESTORED LEFT');
});

test('wide and tall background terminals wrap at the same edge as their server', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 4000, height: 3000 });
  const terminal = await installScreen(page);
  await terminal.locator('.xterm').evaluate(el => el.setAttribute('data-original-view', 'yes'));
  for (const viewport of [
    { width: 4000, height: 3000 },
    { width: 1400, height: 900 },
    { width: 4000, height: 3000 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const calls = await backgroundCalls(page);
        const action = calls
          .reverse()
          .find(({ action }) => action.method === 'pane.resize')?.action;
        if (action?.method !== 'pane.resize') return false;
        return viewport.width === 4000 ? action.params.cols === 300 : action.params.cols < 300;
      })
      .toBe(true);
    await page.evaluate(() => (window as unknown as { __drawSession: () => void }).__drawSession());
    await expect(terminal.locator('.xterm-rows > div').nth(1)).toHaveText('LIVE LEFT');
    await expect(terminal.locator('.xterm-rows > div').first()).not.toContainText('LIVE LEFT');
    await expect(terminal.locator('.xterm')).toHaveAttribute('data-original-view', 'yes');
    expect(await terminal.locator('.xterm-rows > div').count()).toBeLessThanOrEqual(120);
  }
  const calls = await backgroundCalls(page);
  expect(calls.filter(({ action }) => action.method === 'pane.attach')).toHaveLength(1);
  expect(
    calls.filter(({ action }) =>
      ['pane.stop', 'pane.restart', 'pane.detach'].includes(action.method)
    )
  ).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('wide-terminal-alignment.png') });
});

test('rapid resizing waits for a slow server and sends the latest pending dimensions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const terminal = await installScreen(page);
  await expect
    .poll(async () =>
      (await backgroundCalls(page)).some(({ action }) => action.method === 'pane.resize')
    )
    .toBe(true);
  await page.evaluate(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      __releaseResize: () => void;
      __pendingResizes: number;
    };
    const original = state.__TAURI_INTERNALS__.invoke;
    state.__pendingResizes = 0;
    state.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (
        command === 'session_request' &&
        (args.action as SessionAction).method === 'pane.resize'
      ) {
        state.__pendingResizes++;
        if (state.__pendingResizes === 1)
          await new Promise<void>(resolve => {
            state.__releaseResize = resolve;
          });
      }
      return original(command, args);
    };
  });
  for (const width of [1500, 1800, 1600, 1200]) {
    const screen = terminal.locator('.xterm-screen');
    const before = (await screen.boundingBox())!.width;
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await screen.boundingBox())!.width).not.toBe(before);
  }
  expect(
    await page.evaluate(() => (window as unknown as { __pendingResizes: number }).__pendingResizes)
  ).toBe(1);
  await page.evaluate(() =>
    (window as unknown as { __releaseResize: () => void }).__releaseResize()
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __pendingResizes: number }).__pendingResizes)
    )
    .toBe(2);
  await page.evaluate(() => (window as unknown as { __drawSession: () => void }).__drawSession());
  await expect(terminal.locator('.xterm-rows > div').nth(1)).toHaveText('LIVE LEFT');
});
