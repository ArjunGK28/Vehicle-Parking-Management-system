// Browser tests (NFR-05 usability, NFR-08 cross-browser). Not part of `npm test`:
//   npm run e2e                         all three browsers
//   npx playwright test --project=edge  one browser
// The tests start the real server on port 4100 against the parking_test database
// and drive the built web client, so run `npm run build` first (`npm run e2e` does).
require('./e2e/support/env');
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT;
const BASE_URL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  // One worker: every test resets the shared parking_test database.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: require.resolve('./e2e/global-setup.js'),
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/src/index.js',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: { NODE_ENV: 'test', DB_NAME: process.env.DB_NAME, PORT },
  },
  projects: [
    // Chrome and Edge use the browsers installed on the machine.
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    // Firefox needs one download: npm run e2e:install
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});