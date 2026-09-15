import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import { actions, emit, exitPane } from './fixtures/session';

const calls = (page: Page, command: string) =>
  page.evaluate(
    command =>
      (
        window as unknown as { __emdeckCalls: { command: string; args: Record<string, unknown> }[] }
      ).__emdeckCalls.filter(call => call.command === command),
    command
  );
const inputs = async (page: Page) => (await actions(page, 'pane.input')).map(params => params.text);
const uploads = (page: Page) => actions(page, 'pane.attachment');

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckPathInput =
      "'C:/fixture/a screenshot.png' 'C:/fixture/notes.txt' ";
  });
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Claude terminal' })).toBeVisible();
});

const pasteFile = async (page: Page, type: 'paste' | 'drop' = 'paste') => {
  await page
    .locator('.terminal-host')
    .first()
    .evaluate((host, type) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'screenshot.png', {
          type: 'image/png',
        })
      );
      const event =
        type === 'paste'
          ? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
          : new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true });
      host.querySelector('textarea')!.dispatchEvent(event);
    }, type);
};

test('pasted images and browser file drops become paths, with bracketed paste and no submit', async ({
  page,
}) => {
  await emit(page, 'pane-0', '\x1b[?2004h');
  await pasteFile(page);
  await expect
    .poll(() => inputs(page))
    .toEqual(["\x1b[200~'C:/temp/emdeck-attachments/screenshot.png' \x1b[201~"]);
  const upload = (await uploads(page))[0];
  expect(upload).toMatchObject({ id: 'pane-0', name: 'screenshot.png', offset: 0, total: 8 });
  expect(await page.evaluate(data => atob(data).length, upload.data as string)).toBe(8);
  await pasteFile(page, 'drop');
  await expect.poll(async () => (await uploads(page)).length).toBe(2);
  await expect.poll(async () => (await inputs(page)).length).toBe(2);
  await page.locator('.xterm-helper-textarea').evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'plain pasted text');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
  });
  await expect
    .poll(async () => (await inputs(page)).at(-1))
    .toBe('\x1b[200~plain pasted text\x1b[201~');
  expect(await actions(page, 'pane.create')).toHaveLength(1);
});

test('native file drops target the pane under the pointer, including scaled displays', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Codex OpenAI coding agent', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Codex terminal' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await calls(page, 'plugin:event|listen')).filter(
          call => call.args.event === 'tauri://drag-drop'
        ).length
    )
    .toBe(2);
  const target = page.getByRole('region', { name: 'Claude terminal' });
  const bounds = (await target.boundingBox())!;
  await page.evaluate(
    ({ x, y }) => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
      (window as unknown as { __emdeckDrop: (payload: unknown) => void }).__emdeckDrop({
        paths: ['C:/fixture/a screenshot.png', 'C:/fixture/notes.txt'],
        position: { x: x * 2, y: y * 2 },
      });
    },
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  );
  await expect
    .poll(async () => (await actions(page, 'pane.paths')).map(params => [params.id, params.paths]))
    .toEqual([['pane-0', ['C:/fixture/a screenshot.png', 'C:/fixture/notes.txt']]]);
  await expect
    .poll(() => inputs(page))
    .toEqual(["'C:/fixture/a screenshot.png' 'C:/fixture/notes.txt' "]);
  expect(await uploads(page)).toHaveLength(0);
});

test('a failed attachment reports the error and leaves the terminal usable', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckAttachmentError =
      'Could not store this attachment';
  });
  await pasteFile(page);
  await expect(page.getByText('Could not store this attachment')).toBeVisible();
  expect(await inputs(page)).toHaveLength(0);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckAttachmentError = undefined;
  });
  await pasteFile(page);
  await expect.poll(async () => (await inputs(page)).length).toBe(1);
});

test('an upload finishing after a restart cannot insert into the replacement terminal', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckAttachmentDelay = true;
  });
  await pasteFile(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { __emdeckReleaseAttachment?: () => void })
            .__emdeckReleaseAttachment
      )
    )
    .toBe('function');
  await exitPane(page, 'pane-0', 0);
  await page.getByTitle('Restart terminal', { exact: true }).click();
  await expect.poll(async () => (await actions(page, 'pane.restart')).length).toBe(1);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__emdeckAttachmentDelay = false;
    (window as unknown as { __emdeckReleaseAttachment: () => void }).__emdeckReleaseAttachment();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __emdeckAttachmentCount?: number }).__emdeckAttachmentCount
      )
    )
    .toBe(1);
  expect(await inputs(page)).toHaveLength(0);
});
