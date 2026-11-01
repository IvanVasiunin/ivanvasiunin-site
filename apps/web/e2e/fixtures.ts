import { AxeBuilder } from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

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
 * (requestLatencyMs, downloadThroughputKbps, uploadThroughputKbps) in Lantern's Constants.js,
 * checked against Lighthouse 12.6.1 bundled with @lhci/cli 0.15.1.
 */
export const SLOW_4G: NetworkConditions = {
  latencyMs: 562.5,
  downloadKbps: 1474.56,
  uploadKbps: 675,
};

const kbpsToBytesPerSecond = (kbps: number): number => (kbps * 1024) / 8;

export const test = base.extend<ThrottleOptions & { applyThrottle: undefined }>({
  throttle: [null, { option: true }],

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

/** Fails on any axe violation with impact "serious" or "critical" (html-a11y.md). */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help}`);
  expect(serious).toEqual([]);
}
