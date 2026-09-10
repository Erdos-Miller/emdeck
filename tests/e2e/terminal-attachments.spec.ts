import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';

const calls = (page: Page, command: string) =>
  page.evaluate(
    command =>
      (
        window as unknown as { __emdeckCalls: { command: string; args: Record<string, unknown> }[] }
      ).__emdeckCalls.filter(call => call.command === command),
    command
  );

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      __attachmentError?: boolean;
      __releaseAttachment?: () => void;
      __delayAttachment?: boolean;
      __attachmentReturned?: number;
    };
    const original = state.__TAURI_INTERNALS__.invoke;
    state.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      const result = await original(command, args);
      if (command === 'terminal_attachment') {
        if (state.__delayAttachment)
          await new Promise<void>(resolve => {
            state.__releaseAttachment = resolve;
          });
        if (state.__attachmentError) throw 'Could not store this attachment';
        state.__attachmentReturned = (state.__attachmentReturned ?? 0) + 1;
        return `'C:/temp/emdeck-attachments/${args.name}' `;
      }
      if (command === 'terminal_path_input')
        return (args.paths as string[]).map(path => `'${path}' `).join('');
      return result;
    };
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
  await page.evaluate(() =>
    (
      window as unknown as { __emdeckEmitTerminal: (id: string, event: unknown) => void }
    ).__emdeckEmitTerminal('pty-0', {
      type: 'data',
      data: Array.from(new TextEncoder().encode('\x1b[?2004h')),
    })
  );
  await pasteFile(page);
  await expect
    .poll(async () => (await calls(page, 'terminal_write')).map(call => call.args.data))
    .toEqual(["\x1b[200~'C:/temp/emdeck-attachments/screenshot.png' \x1b[201~"]);
  expect((await calls(page, 'terminal_attachment'))[0].args.data).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  await pasteFile(page, 'drop');
  await expect.poll(async () => (await calls(page, 'terminal_attachment')).length).toBe(2);
  await expect.poll(async () => (await calls(page, 'terminal_write')).length).toBe(2);
  await page.locator('.xterm-helper-textarea').evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'plain pasted text');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
  });
  await expect
    .poll(async () => (await calls(page, 'terminal_write')).at(-1)?.args.data)
    .toBe('\x1b[200~plain pasted text\x1b[201~');
  expect(await calls(page, 'terminal_spawn')).toHaveLength(1);
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
    .poll(async () => (await calls(page, 'terminal_path_input')).map(call => call.args))
    .toEqual([{ id: 'pty-0', paths: ['C:/fixture/a screenshot.png', 'C:/fixture/notes.txt'] }]);
  await expect
    .poll(async () => (await calls(page, 'terminal_write')).map(call => call.args))
    .toEqual([{ id: 'pty-0', data: "'C:/fixture/a screenshot.png' 'C:/fixture/notes.txt' " }]);
  expect(await calls(page, 'terminal_attachment')).toHaveLength(0);
});

test('a failed attachment reports the error and leaves the terminal usable', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __attachmentError: boolean }).__attachmentError = true;
  });
  await pasteFile(page);
  await expect(page.getByText('Could not store this attachment', { exact: true })).toBeVisible();
  expect(await calls(page, 'terminal_write')).toHaveLength(0);
  await page.evaluate(() => {
    (window as unknown as { __attachmentError: boolean }).__attachmentError = false;
  });
  await pasteFile(page);
  await expect.poll(async () => (await calls(page, 'terminal_write')).length).toBe(1);
});

test('an upload finishing after a restart cannot insert into the replacement terminal', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as { __delayAttachment: boolean }).__delayAttachment = true;
  });
  await pasteFile(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof (window as unknown as { __releaseAttachment?: () => void }).__releaseAttachment
      )
    )
    .toBe('function');
  await page.evaluate(() =>
    (
      window as unknown as { __emdeckEmitTerminal: (id: string, event: unknown) => void }
    ).__emdeckEmitTerminal('pty-0', { type: 'exit', code: 0 })
  );
  await page.getByTitle('Restart terminal', { exact: true }).click();
  await expect.poll(async () => (await calls(page, 'terminal_spawn')).length).toBe(2);
  await page.evaluate(() =>
    (window as unknown as { __releaseAttachment: () => void }).__releaseAttachment()
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __attachmentReturned: number }).__attachmentReturned
      )
    )
    .toBe(1);
  expect(await calls(page, 'terminal_write')).toHaveLength(0);
});
