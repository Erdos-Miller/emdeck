import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { channel: process.platform === 'win32' ? 'msedge' : 'chromium' },
  },
  webServer: {
    command: 'bun run preview --port 1420',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
