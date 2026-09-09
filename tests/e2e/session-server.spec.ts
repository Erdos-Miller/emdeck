import { test, expect } from './fixtures/desktop';
import type { SessionAction, SessionSnapshot } from '../../src/shared/contracts/sessions';

test('background view attaches existing agents, preserves terminals and separates detach from stop', async ({
  page,
}) => {
  await page.evaluate(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      __sessionActions: SessionAction[];
    };
    state.__sessionActions = [];
    const original = state.__TAURI_INTERNALS__.invoke;
    const snapshot: SessionSnapshot = {
      protocol: 1,
      serverId: 'server',
      revision: 1,
      workspaces: [{ id: 'workspace', name: 'Background project', root: '/projects/background' }],
      panes: [
        {
          id: 'agent',
          generation: 'generation',
          launch: {
            workspaceId: 'workspace',
            name: 'Detached Claude',
            cwd: '/projects/background',
            shell: '',
            command: 'claude',
            resumeOnRestart: false,
          },
          running: true,
          restored: false,
          exitCode: null,
          startedAt: 1,
          cols: 80,
          rows: 24,
          agent: {
            kind: 'claude',
            state: 'blocked',
            source: 'report',
            reason: 'Permission request',
            sessionId: 'conversation',
          },
        },
      ],
    };
    state.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (command === 'session_connect') return 'connection';
      if (command === 'session_disconnect') return null;
      if (command !== 'session_request') return original(command, args);
      const action = args.action as SessionAction;
      state.__sessionActions.push(action);
      if (action.method === 'session.snapshot') {
        await new Promise(resolve => setTimeout(resolve, 100));
        return structuredClone(snapshot);
      }
      if (action.method === 'pane.read') {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          sequence: 1,
          reset: action.params.after === null,
          data: action.params.after === null ? btoa('DETACHED SESSION RETAINED\r\n') : '',
          text: 'DETACHED SESSION RETAINED',
          pane: structuredClone(snapshot.panes[0]),
        };
      }
      if (action.method === 'pane.attach') return snapshot.panes[0];
      if (action.method === 'pane.stop') {
        snapshot.panes[0].running = false;
        snapshot.panes[0].agent.state = 'stopped';
        snapshot.revision++;
      }
      return null;
    };
  });
  const actions = () =>
    page.evaluate(
      () => (window as unknown as { __sessionActions: SessionAction[] }).__sessionActions
    );
  await page.getByLabel('Terminal view').selectOption('server');
  await expect(page.getByText('Your agents can keep working.')).toBeVisible();
  expect(await actions()).toHaveLength(0);
  await page.getByRole('button', { name: 'Connect local server', exact: true }).click();
  const rail = page.getByRole('complementary', { name: 'Background machines and agents' });
  await expect(rail).toContainText('Permission request');
  await rail.getByRole('button', { name: /Detached Claude/ }).click();
  const terminal = page.getByRole('region', { name: 'Detached Claude persistent terminal' });
  await expect(terminal).toContainText('DETACHED SESSION RETAINED');
  await terminal
    .locator('.xterm')
    .evaluate(el => el.setAttribute('data-session-test', 'preserved'));
  await page.getByLabel('Terminal view').selectOption('panes');
  await page.getByLabel('Terminal view').selectOption('server');
  await expect(page.locator('[data-session-test="preserved"]')).toBeVisible();
  await terminal.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('explicit input');
  await expect
    .poll(async () =>
      (await actions()).flatMap(a => (a.method === 'pane.input' ? [a.params.text] : [])).join('')
    )
    .toBe('explicit input');
  expect((await actions()).filter(a => a.method === 'pane.create')).toHaveLength(0);
  await terminal.getByTitle('Detach view; keep process running').click();
  await expect(terminal).toHaveCount(0);
  expect((await actions()).filter(a => a.method === 'pane.stop')).toHaveLength(0);
  await rail.getByRole('button', { name: /Detached Claude/ }).click();
  await expect(terminal).toBeVisible();
  await terminal.getByTitle('Stop process on its machine').click();
  await expect(page.getByRole('alert')).toContainText('Its running process will end');
  await page.getByRole('button', { name: 'Keep running', exact: true }).click();
  expect((await actions()).filter(a => a.method === 'pane.stop')).toHaveLength(0);
  await terminal.getByTitle('Stop process on its machine').click();
  await page.getByRole('button', { name: 'Stop process', exact: true }).click();
  await expect(rail.getByRole('button', { name: 'Start again', exact: true })).toBeVisible();
  expect((await actions()).filter(a => a.method === 'pane.stop')).toHaveLength(1);
  await page.getByTitle('Expand terminals', { exact: true }).click();
  await page.screenshot({ path: 'test-results/session-server.png' });
});
