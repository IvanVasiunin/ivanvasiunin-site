import { defineConfig, devices } from '@playwright/test';
import { SLOW_4G, type ThrottleOptions } from './e2e/fixtures';

const PORT = 4321;
const isCI = Boolean(process.env.CI);

// E2E, a11y and (later) visual tests against the production build (docs/TESTING.md §1).
export default defineConfig<ThrottleOptions>({
  testDir: './e2e',
  fullyParallel: true,
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
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // WebKit has no CDP, so the iPhone profile runs without CPU / network throttling.
    { name: 'mobile-iphone', use: { ...devices['iPhone 17 Pro Max'] } },
    // 360 px wide: the smallest supported viewport. Slow 4G + 4x CPU slowdown via CDP.
    {
      name: 'mobile-android',
      use: { ...devices['Galaxy S24'], throttle: { cpuRate: 4, network: SLOW_4G } },
    },
  ],
});
