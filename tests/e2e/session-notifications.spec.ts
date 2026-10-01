import { expect, test } from './fixtures/desktop';
import type { Page } from './fixtures/desktop';
import { connectBackgroundLayout, installBackgroundLayout } from './fixtures/background-layout';
import type { SessionSnapshot } from '../../src/shared/contracts/sessions';

type AudioProbe = { __notes: number[]; __levels: number[] };
const instrumentAudio = async (page: Page) => {
  await page.addInitScript(() => {
    const probe = window as unknown as AudioProbe;
    probe.__notes = [];
    probe.__levels = [];
    // Exercise the real Web Audio graph. Chromium's mute-audio launch flag
    // prevents test sounds reaching the user's speakers.
    window.AudioContext = class extends AudioContext {
      createOscillator() {
        const node = super.createOscillator();
        const start = node.start.bind(node);
        node.start = when => {
          probe.__notes.push(node.frequency.value);
          start(when);
        };
        return node;
      }
      createGain() {
        const node = super.createGain();
        const ramp = node.gain.linearRampToValueAtTime.bind(node.gain);
        node.gain.linearRampToValueAtTime = (value, time) => {
          probe.__levels.push(value);
          return ramp(value, time);
        };
        return node;
      }
    };
  });
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText('first');
};
const notes = (page: Page) => page.evaluate(() => (window as unknown as AudioProbe).__notes);
const clearNotes = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as AudioProbe).__notes = [];
  });
const screen = (page: Page, text: string) =>
  page.evaluate(text => {
    (
      window as unknown as { __emdeckEmitTerminal: (id: string, event: unknown) => void }
    ).__emdeckEmitTerminal('pty-0', {
      type: 'data',
      data: [...new TextEncoder().encode(`\x1b[2J\x1b[H\x1b[999;1H${text}`)],
    });
  }, text);
const expectNotes = async (page: Page, expected: number[]) =>
  expect.poll(() => notes(page)).toEqual(expected);
const closeSettings = (page: Page) =>
  page.getByRole('button', { name: 'Done', exact: true }).click();
const waiting = 'Would you like to run this command?\r\n❯ 1. Yes\r\n  2. No';
const working = 'Working...\r\nEsc to interrupt';

test('local sessions sound on waiting, completion and error while hidden, without restarting terminals', async ({
  page,
}) => {
  await instrumentAudio(page);
  await page.getByLabel('Terminal view').selectOption('workspaces');
  await page.getByRole('button', { name: 'New terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Claude Code' }).click();
  await expect(page.locator('.terminal-pane .xterm')).toHaveCount(1);
  await page
    .locator('.terminal-pane .xterm')
    .evaluate(element => element.setAttribute('data-preserved', 'yes'));
  await screen(page, '❯');
  await expect(page.locator('.rail-sessions')).toContainText('Ready');
  await expectNotes(page, []);
  await screen(page, waiting);
  await expectNotes(page, [660, 880]);
  await screen(page, waiting);
  await page.waitForTimeout(500);
  await expectNotes(page, [660, 880]);
  await screen(page, working);
  await expect(page.locator('.rail-sessions')).toContainText('Working');
  await page.getByTitle('Hide session; keep it running').click();
  await expect(
    page.getByRole('button', { name: 'Hidden sessions (1)', exact: true })
  ).toBeVisible();
  await expect(page.locator('.terminal-pane:visible')).toHaveCount(0);
  await screen(page, 'Implemented the change.\r\n✻ Cooked for 12s\r\n❯');
  await expectNotes(page, [660, 880, 523.25, 659.25, 783.989990234375]);
  await page.evaluate(() => {
    (
      window as unknown as { __emdeckEmitTerminal: (id: string, event: unknown) => void }
    ).__emdeckEmitTerminal('pty-0', { type: 'exit', code: 1 });
  });
  await expect.poll(async () => (await notes(page)).slice(-2)).toEqual([392, 261.6300048828125]);
  await expect(page.locator('.xterm[data-preserved="yes"]')).toHaveCount(1);
});

test('global sound settings preview, mute, persist and never enter project overrides', async ({
  page,
}) => {
  await instrumentAudio(page);
  await page.getByTitle('Settings', { exact: true }).click();
  const settings = page.getByRole('region', { name: 'Sound notifications' });
  await expect(settings.getByLabel('Enable notification sounds')).toBeChecked();
  await settings.getByLabel('Notification volume').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowRight');
  await settings.getByRole('button', { name: 'Preview waiting for me sound' }).click();
  await expectNotes(page, [660, 880]);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as AudioProbe).__levels[0]))
    .toBeCloseTo(0.117);
  await settings.getByLabel(/^Waiting for me/).uncheck();
  await settings.getByLabel('Only when this window is unfocused').check();
  await settings.getByLabel('Enable notification sounds').uncheck();
  await expect(settings.getByLabel(/^Error/)).toBeDisabled();
  // Explicit previews still work while automatic notifications are muted.
  await settings.getByRole('button', { name: 'Preview error sound' }).click();
  await expect.poll(async () => (await notes(page)).length).toBe(4);
  await closeSettings(page);
  const persisted = await page.evaluate(() => ({
    personal: JSON.parse(localStorage.getItem('relay:settings') ?? '{}').notifications,
    project: localStorage.getItem('test:project-config:/projects/first'),
  }));
  expect(persisted.personal).toEqual({
    enabled: false,
    waiting: false,
    done: true,
    error: true,
    volume: 65,
    unfocusedOnly: true,
  });
  expect(persisted.project ?? '').not.toContain('notifications');
  await page.reload();
  await page.getByTitle('Settings', { exact: true }).click();
  await expect(settings.getByLabel('Enable notification sounds')).not.toBeChecked();
  await expect(settings.getByLabel('Notification volume')).toHaveValue('65');
  await expectNotes(page, []);
});

test('connected background sessions notify without attaching, with event switches and focus filtering', async ({
  page,
}) => {
  await instrumentAudio(page);
  await installBackgroundLayout(page);
  await connectBackgroundLayout(page);
  await expectNotes(page, []);
  const state = async (value: 'working' | 'blocked' | 'done') =>
    page.evaluate(value => {
      const snapshot = (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
        .__layoutSnapshots.local;
      snapshot.panes[0].agent.state = value;
      snapshot.revision++;
    }, value);
  await state('blocked');
  await expectNotes(page, [660, 880]);
  await page.waitForTimeout(350);
  await expectNotes(page, [660, 880]);
  await clearNotes(page);
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByLabel('Only when this window is unfocused').check();
  await closeSettings(page);
  await state('working');
  await page.waitForTimeout(250);
  await state('done');
  await page.waitForTimeout(350);
  await expectNotes(page, []);
  // The status monitor uses the actual document focus state at transition time.
  await page.evaluate(() => {
    document.hasFocus = () => false;
  });
  await state('working');
  await page.waitForTimeout(250);
  await state('done');
  await expect.poll(async () => (await notes(page)).length).toBe(3);
  await clearNotes(page);
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByLabel(/^Error/).uncheck();
  await closeSettings(page);
  await page.evaluate(() => {
    const snapshot = (window as unknown as { __layoutSnapshots: Record<string, SessionSnapshot> })
      .__layoutSnapshots.local;
    snapshot.panes[0].running = false;
    snapshot.panes[0].exitCode = 1;
    snapshot.revision++;
  });
  await page.waitForTimeout(350);
  await expectNotes(page, []);
  await expect(page.locator('.session-terminal .xterm')).toHaveCount(0);
});
