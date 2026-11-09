import { defineConfig, devices } from '@playwright/test';
import { SLOW_4G, type ThrottleOptions } from './e2e/fixtures';

// Not 4321 (and its 4322+ fallbacks): that is `astro dev`, and a reused dev server would make e2e test
// the dev build instead of the production build.
const PORT = 4400;
const isCI = Boolean(process.env.CI);

// E2E, a11y and visual tests against the production build (docs/TESTING.md §1).
const VISUAL = /visual\.spec\.ts$/;
export default defineConfig<ThrottleOptions>({
  testDir: './e2e',
  fullyParallel: true,
  // Locally, more parallel browsers than this crash on memory pressure (Windows commit limit); CI keeps
  // Playwright's default.
  ...(isCI ? {} : { workers: 2 }),
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm run build && pnpm run preview --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: { ASTRO_TELEMETRY_DISABLED: '1' },
  },
  projects: [
    { name: 'desktop-chromium', testIgnore: VISUAL, use: { ...devices['Desktop Chrome'] } },
    // WebKit has no CDP, so the iPhone profile runs without CPU / network throttling.
    { name: 'mobile-iphone', testIgnore: VISUAL, use: { ...devices['iPhone 17 Pro Max'] } },
    // 360 px wide: the smallest supported viewport. Slow 4G + 4x CPU slowdown via CDP.
    {
      name: 'mobile-android',
      testIgnore: VISUAL,
      use: { ...devices['Galaxy S24'], throttle: { cpuRate: 4, network: SLOW_4G } },
    },
    // Responsive snapshots: one engine, no throttling, widths set per test (TESTING.md §6).
    { name: 'visual-chromium', testMatch: VISUAL, use: { ...devices['Desktop Chrome'] } },
  ],
});
