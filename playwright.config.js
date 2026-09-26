import { defineConfig } from '@playwright/test';
import { feelProject, FEEL_PROFILES } from './src/feel/playwright.js';

// snapshot names carry no {platform} on purpose: a hash pinned on darwin
// has to be the same file ci reads on ubuntu (¬‿¬)
// the feel project runs alone (npm run feel, one worker): its budgets can't share the machine with
// other specs, and npm run e2e only ever runs the chromium project
export default defineConfig({
  testDir: 'test/e2e',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    feelProject({ testDir: 'test/feel', testMatch: ['*.spec.js', '*.feel.js'] }),
    // not a test suite: a camera for joe's eye before the tag. video on, nothing asserted, never in
    // npm run e2e or npm run feel, never in ci
    {
      name: 'showcase',
      testDir: 'test/showcase',
      testMatch: '*.showcase.js',
      outputDir: 'test-results/showcase',
      retries: 0,
      use: {
        browserName: 'chromium',
        viewport: FEEL_PROFILES.m5.viewport,
        deviceScaleFactor: FEEL_PROFILES.m5.deviceScaleFactor,
        video: { mode: 'on', size: FEEL_PROFILES.m5.viewport },
      },
    },
  ],
  webServer: {
    command: 'node scripts/serve.js',
    url: 'http://127.0.0.1:4173/package.json',
    reuseExistingServer: process.env.CI ? false : true,
    timeout: 10_000,
  },
});
