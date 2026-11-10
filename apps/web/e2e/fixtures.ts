import { AxeBuilder } from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

import { MAP_POINTS } from './map-points';

export interface NetworkConditions {
  readonly latencyMs: number;
  readonly downloadKbps: number;
  readonly uploadKbps: number;
}

export interface ThrottleOptions {
  /** CPU and network throttling via Chrome DevTools Protocol. Chromium only. */
  readonly throttle: { readonly cpuRate: number; readonly network: NetworkConditions } | null;
}

/**
 * Lighthouse mobile "Slow 4G" values for DevTools (applied) throttling: `throttling.mobileSlow4G`
 * (requestLatencyMs, downloadThroughputKbps, uploadThroughputKbps) in lighthouse/core/config/constants.js,
 * checked against Lighthouse 13.5.0 (ROADMAP 1.8).
 */
export const SLOW_4G: NetworkConditions = {
  latencyMs: 562.5,
  downloadKbps: 1474.56,
  uploadKbps: 675,
};

const kbpsToBytesPerSecond = (kbps: number): number => (kbps * 1024) / 8;

export const test = base.extend<
  ThrottleOptions & { applyThrottle: undefined; mapPoints: undefined }
>({
  throttle: [null, { option: true }],

  // The knowledge map's data: a fixed file for every page (map-points.ts), so the map looks the
  // same everywhere; a test may route the file again to override it.
  mapPoints: [
    async ({ page }, use) => {
      await page.route('**/data/points.json', (route) => route.fulfill({ json: MAP_POINTS }));
      await use(undefined);
    },
    { auto: true },
  ],

  applyThrottle: [
    async ({ page, throttle, browserName }, use) => {
      if (throttle) {
        if (browserName !== 'chromium') {
          throw new Error(`CDP throttling needs Chromium, but this project runs ${browserName}.`);
        }
        const conditions = {
          latency: throttle.network.latencyMs,
          downloadThroughput: kbpsToBytesPerSecond(throttle.network.downloadKbps),
          uploadThroughput: kbpsToBytesPerSecond(throttle.network.uploadKbps),
          connectionType: 'cellular4g' as const,
        };
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        // Replaces the deprecated `Network.emulateNetworkConditions`.
        // An empty URL pattern applies the conditions to every request.
        await cdp.send('Network.emulateNetworkConditionsByRule', {
          matchedNetworkConditions: [{ urlPattern: '', ...conditions }],
        });
        // Makes `navigator.connection` report the emulated network too.
        await cdp.send('Network.overrideNetworkState', { offline: false, ...conditions });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.cpuRate });
      }
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Fails on any axe violation with impact "serious" or "critical" (html-a11y.md).
 *
 * Checks the settled page: scroll-driven reveals (mixins.scss → reveal-on-scroll) leave a block that
 * rests at the very bottom edge mid-fade, and axe would measure that passing opacity as a contrast
 * failure (it did, at random, depending on where the fold fell). With reduced motion every reveal
 * shows its final state, so the colours checked are the ones a reader sees.
 */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help}`);
  expect(serious).toEqual([]);
}

/**
 * Shows the page in a theme as a visitor's choice would (stored before the page loads), with the
 * system theme to match. The page is dark by default whatever the system theme (SPEC US-X1), so
 * `emulateMedia({ colorScheme })` alone no longer picks the light theme. Call before `goto`.
 */
export async function chooseTheme(
  page: Page,
  theme: 'light' | 'dark',
  media: Parameters<Page['emulateMedia']>[0] = {},
): Promise<void> {
  await page.emulateMedia({ ...media, colorScheme: theme });
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('theme', value);
    } catch {
      // Blocked storage: the test that blocks it checks the default instead.
    }
  }, theme);
}
