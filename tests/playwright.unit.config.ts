import { defineConfig } from '@playwright/test';

// Lightweight config for unit-style, non-UI tests. No global setup, no browsers.
export default defineConfig({
  testDir: './',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list']
  ],
  // Limit to unit specs only
  projects: [
    {
      name: 'unit',
      testMatch: /.*\.unit\.spec\.ts/,
    },
  ],
  use: {
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});


