import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import type { SessionAction, SessionSnapshot } from '../../src/shared/contracts/sessions';
import {
  backgroundCalls,
  backgroundPane,
  connectBackgroundLayout,
  installBackgroundLayout,
} from './fixtures/background-layout';

const setup = async (page: Page) => {
  await installBackgroundLayout(page);
  await page.evaluate(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      __layoutSnapshots: Record<string, SessionSnapshot>;
      __failSessionAction?: string;
      __holdSessionAction?: string;
      __releaseSessionAction: () => void;
    };
    const original = state.__TAURI_INTERNALS__.invoke;
    state.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      const action = args.action as SessionAction | undefined;
      if (
        command === 'session_request' &&
        (action?.method === 'pane.stop' || action?.method === 'pane.remove')
      ) {
        await original(command, args);
        if (state.__holdSessionAction === action.method) {
          state.__holdSessionAction = undefined;
          await new Promise<void>(resolve => {
            state.__releaseSessionAction = resolve;
          });
        }
        if (state.__failSessionAction === action.method) {
          state.__failSessionAction = undefined;
          throw new Error('Fixture server refused the action. Retry.');
        }
        const snapshot = state.__layoutSnapshots[String(args.connection)];
        const pane = snapshot.panes.find(pane => pane.id === action.params.id)!;
        if (action.method === 'pane.stop') {
          pane.running = false;
          pane.agent.state = 'stopped';
        } else {
          if (pane.running) throw new Error('Stop the running pane before removing it.');
          snapshot.panes = snapshot.panes.filter(other => other.id !== pane.id);
        }
        snapshot.revision++;
        return null;
      }
      return original(command, args);
    };
  });
  await connectBackgroundLayout(page);
  const machines = page.getByRole('complementary', { name: 'Background machines and agents' });
  for (const name of ['claude local', 'codex remote'])
    await machines.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await page.getByLabel('Terminal view').selectOption('workspaces');
  const rail = page.getByRole('complementary', { name: 'Terminal workspaces' });
  await rail.getByTitle('Focus claude local on This computer', { exact: true }).click();
  await expect(backgroundPane(page, 'local/0').locator('.xterm-rows')).toContainText('READY>');
};

test('Stop opens an accessible dialog above the workspace, then Remove clears only that session', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await setup(page);
  const terminal = backgroundPane(page, 'local/0');
  const other = backgroundPane(page, 'remote/1');
  await other.locator('.xterm').evaluate(el => el.setAttribute('data-preserved', 'yes'));
  await terminal.getByTitle('Stop process on its machine').click();
  const dialog = page.getByRole('dialog', { name: 'Stop background session?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('claude local');
  await expect(dialog).toContainText('This computer');
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(640);
  await page.screenshot({ path: testInfo.outputPath('stop-background-session.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(terminal.getByTitle('Stop process on its machine')).toBeFocused();
  expect(
    (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.stop')
  ).toHaveLength(0);
  await terminal.getByTitle('Stop process on its machine').click();
  await dialog.getByRole('button', { name: 'Stop process', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(terminal.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
  await terminal.getByRole('button', { name: 'Remove', exact: true }).click();
  const remove = page.getByRole('dialog', { name: 'Remove background session?' });
  await remove.getByRole('button', { name: 'Keep session', exact: true }).click();
  await expect(terminal).toBeVisible();
  await terminal.getByRole('button', { name: 'Remove', exact: true }).click();
  await remove.getByRole('button', { name: 'Remove session', exact: true }).click();
  await expect(terminal).toHaveCount(0);
  await expect(other).toBeVisible();
  await expect(other.locator('.xterm')).toHaveAttribute('data-preserved', 'yes');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('relay:session-views')!)))
    .toEqual(['remote/1']);
  const calls = await backgroundCalls(page);
  expect(
    calls
      .filter(({ action }) => ['pane.stop', 'pane.remove'].includes(action.method))
      .map(({ connection, action }) => ({ connection, action }))
  ).toEqual([
    { connection: 'local', action: { method: 'pane.stop', params: { id: '0' } } },
    { connection: 'local', action: { method: 'pane.remove', params: { id: '0' } } },
  ]);
  expect(
    calls.filter(({ action }) => ['pane.restart', 'pane.create'].includes(action.method))
  ).toHaveLength(0);
});

test('failed Stop and Remove stay visible for retry and retain the session until removal succeeds', async ({
  page,
}) => {
  await setup(page);
  const terminal = backgroundPane(page, 'local/0');
  for (const [method, title, trigger, submit] of [
    ['pane.stop', 'Stop background session?', 'Stop', 'Stop process'],
    ['pane.remove', 'Remove background session?', 'Remove', 'Remove session'],
  ]) {
    await page.evaluate(method => {
      (window as unknown as { __failSessionAction: string }).__failSessionAction = method;
    }, method);
    await terminal.getByRole('button', { name: trigger, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: title });
    await dialog.getByRole('button', { name: submit, exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Fixture server refused');
    await expect(terminal).toBeVisible();
    await dialog.getByRole('button', { name: submit, exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(terminal).toHaveCount(0);
});

test('pending Stop cannot be repeated and removal from the machine list clears its saved view', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    (window as unknown as { __holdSessionAction: string }).__holdSessionAction = 'pane.stop';
  });
  const terminal = backgroundPane(page, 'local/0');
  await terminal.getByTitle('Stop process on its machine').click();
  const dialog = page.getByRole('dialog', { name: 'Stop background session?' });
  await dialog.getByRole('button', { name: 'Stop process', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Stopping…', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Keep running', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(
    (await backgroundCalls(page)).filter(({ action }) => action.method === 'pane.stop')
  ).toHaveLength(1);
  await page.evaluate(() =>
    (window as unknown as { __releaseSessionAction: () => void }).__releaseSessionAction()
  );
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole('complementary', { name: 'Terminal workspaces' })
    .getByRole('button', { name: 'Background machines', exact: true })
    .click();
  await page
    .locator('.session-agent-row')
    .filter({ has: page.getByRole('button', { name: /^claude local/ }) })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Remove background session?' })
    .getByRole('button', { name: 'Remove session', exact: true })
    .click();
  await expect(terminal).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('relay:session-views')!)))
    .toEqual(['remote/1']);
});
