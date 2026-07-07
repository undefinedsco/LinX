import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.LINX_E2E_BASE_URL ?? 'http://localhost:5173'
const devServerUrl = new URL(baseURL)
const reuseExistingServer = process.env.LINX_E2E_REUSE_SERVER === undefined
  ? true
  : process.env.LINX_E2E_REUSE_SERVER === '1'

/**
 * Playwright E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './specs',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /*
   * E2E suites share local desktop/xpod launch state, production Cloud smoke
   * accounts, and Cloud-managed Local domains. Running files in parallel makes
   * those tests race each other even when each spec is internally serial.
   */
  workers: 1,
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to test on more browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `cd ../../ && yarn workspace @linx/web dev --host ${devServerUrl.hostname} --port ${devServerUrl.port || '5173'} --strictPort`,
    url: baseURL,
    reuseExistingServer,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
