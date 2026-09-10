import { createServer } from 'node:net';
import { expect } from '@playwright/test';

// A loopback peer closes before SSH authentication. This exercises the real
// OpenSSH/PTY error and retry path without a remote account or server.
export const verifyNativeRemote = async page => {
  let connections = 0;
  let peerError;
  const peer = createServer(socket => {
    connections++;
    socket.on('error', error => {
      // OpenSSH may reset the connection after the deliberate early close.
      if (error.code !== 'ECONNRESET') peerError = error;
    });
    socket.end();
  });
  await new Promise((resolve, reject) => {
    peer.once('error', reject);
    peer.listen(0, '127.0.0.1', resolve);
  });
  const port = peer.address().port;
  try {
    await page.getByRole('button', { name: 'New terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Terminal Your default shell', exact: true }).click();
    const local = page.getByRole('region', { name: 'Terminal terminal', exact: true });
    await expect(local).toContainText('Connected');
    await local.locator('.xterm').evaluate(element => (element.dataset.nativeRemote = 'preserved'));
    await page.getByLabel('Terminal view').selectOption('workspaces');
    await page.getByTitle('Remote connections', { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Remote connections' });
    await dialog.getByRole('button', { name: 'Add connection' }).click();
    await dialog.getByLabel('Connection name').fill('Loopback transport test');
    await dialog.getByLabel('SSH host').fill('127.0.0.1');
    await dialog.getByLabel('Port', { exact: true }).fill(String(port));
    await dialog.getByRole('button', { name: 'Save connection' }).click();
    expect(connections).toBe(0);
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    const remote = page.getByRole('region', { name: 'Loopback transport test terminal' });
    await expect(remote).toContainText('SSH disconnected with code 255');
    expect(connections).toBe(1);
    await remote.getByTitle('Reconnect remote session').click();
    await expect.poll(() => connections).toBe(2);
    await expect(remote).toContainText('SSH disconnected with code 255');
    await remote.getByTitle('Disconnect Loopback transport test').click();
    await expect(remote).toHaveCount(0);
    await page.getByLabel('Terminal view').selectOption('panes');
    await expect(local.locator('.xterm')).toHaveAttribute('data-native-remote', 'preserved');
    await local.locator('.xterm-helper-textarea').focus();
    await page.keyboard.type('Write-Output EMDECK_LOCAL_STILL_ALIVE');
    await page.keyboard.press('Enter');
    await expect(local.locator('.xterm-rows')).toContainText('EMDECK_LOCAL_STILL_ALIVE');
    await local.getByTitle('Close Terminal', { exact: true }).click();
    await page.getByRole('button', { name: 'Close terminal', exact: true }).click();
    await expect(page.locator('.terminal-pane')).toHaveCount(0);
    expect(peerError).toBeUndefined();
    console.log(
      'Native remote passed: explicit OpenSSH connection, failure/retry, disconnect, workspace switching and local PTY preservation. No remote authentication attempted.'
    );
  } finally {
    await new Promise(resolve => peer.close(resolve));
  }
};
