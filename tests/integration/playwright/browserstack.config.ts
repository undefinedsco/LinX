import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  timeout: 60000,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'web-chromium',
      use: { browserName: 'chromium' }
    },
    {
      name: 'browserstack-mobile',
      testMatch: /parity\.spec\.ts/,
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream']
        }
      }
    }
  ]
};

export default config;
