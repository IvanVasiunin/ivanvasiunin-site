import type { Page } from '@playwright/test';

import { mockScenario, toSse } from '../src/lib/chat/mock/scenarios';
import { expect, test } from './fixtures';

// The knowledge map under CPU throttling (ROADMAP 6.4, SPEC §6.3, TESTING.md §5), Chromium only
// (CPU throttling is CDP). An answer arrives and the map's frames are timed from inside the page:
// every requestAnimationFrame callback that draws on a canvas is one of the map's frames.
//
// What headless Chromium can and cannot tell (measured 2026-11-07): it rasterizes the canvas in
// software, on the throttled CPU, so its frames are far longer than in a real Chrome with a GPU
// (production build, 4×: 1.9% long frames, 14 ms median gap; 6×: 7.6%, 35 ms; headless 4×: about
// a quarter long). So here:
// - the map's work per frame (its drawing, here incl. the software raster) fits a 60 fps frame
//   at 4×;
// - the light-mode detector (lib/viz/frames.ts) agrees with the frames: a clearly stuttering
//   ignition turns light mode on, a clearly smooth one leaves it off (the borderline is not
//   judged, so the test never flakes on it).
// Long-frame shares in a real Chrome are measured by the perf-check skill.

const WIDE = { width: 1440, height: 900 };
/** The map's work per frame at 4× CPU, median: one 60 fps frame (measured headless: 7–11 ms). */
const DRAW_BUDGET_MS = 16.7;
/** The detector's rule (lib/viz/frames.ts: over 25% long frames in an animation of 1 s or more;
 * a gap over 1 s is idle time). */
const LONG_FRAME_MS = 50;
const MIN_ANIMATION_MS = 1000;
const IDLE_GAP_MS = 1000;
/** Clearly stuttering / clearly smooth, either side of the detector's 25%. */
const CLEARLY_SLOW = 0.35;
const CLEARLY_SMOOTH = 0.15;
/** The map is at rest (the ignition judged) once it has drawn nothing for this long. */
const QUIET_MS = 1500;
/** The longest an ignition may take, throttled. */
const IGNITION_TIMEOUT_MS = 30_000;

interface MapFrame {
  readonly at: number;
  readonly cost: number;
}

interface ProbeWindow {
  mapFrames: MapFrame[];
}

async function mockChat(page: Page): Promise<void> {
  await page.route('**/api/chat', async (route) => {
    const scenario = mockScenario('What did Ivan do at BrainRocket?');
    if (scenario.kind === 'http-error') throw new Error('expected a streamed answer');
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: scenario.steps.map((step) => toSse(step.event)).join(''),
    });
  });
}

/** Before any page script: time every frame callback that draws on a canvas (the map's). */
async function probeMapFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as ProbeWindow;
    w.mapFrames = [];
    let draws = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const drawImage = Object.getOwnPropertyDescriptor(proto, 'drawImage')?.value as (
      this: CanvasRenderingContext2D,
      ...args: unknown[]
    ) => void;
    Object.defineProperty(proto, 'drawImage', {
      configurable: true,
      writable: true,
      value(this: CanvasRenderingContext2D, ...args: unknown[]) {
        draws += 1;
        drawImage.apply(this, args);
      },
    });
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      request((at) => {
        draws = 0;
        const start = performance.now();
        callback(at);
        if (draws > 0) w.mapFrames.push({ at, cost: performance.now() - start });
      });
  });
}

async function answerAt(page: Page, rate: number): Promise<MapFrame[]> {
  await page.setViewportSize(WIDE);
  await mockChat(page);
  await probeMapFrames(page);
  await page.goto('/');
  const map = page.getByRole('region', { name: 'Knowledge map' });
  await expect(map).toHaveAttribute('data-ready', '');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await page.evaluate(() => {
    (window as unknown as ProbeWindow).mapFrames = [];
  });
  const input = page.getByRole('textbox', { name: 'Ask Elio about Ivan' });
  await input.fill('What did Ivan do at BrainRocket?');
  await input.press('Enter');
  await expect(map).toContainText(/Elio read \d+ passages?/);
  // Until the map stops drawing by itself: the detector judges an ignition when it ends.
  await expect
    .poll(
      () =>
        page.evaluate((quiet) => {
          const frames = (window as unknown as ProbeWindow).mapFrames;
          const last = frames.at(-1)?.at ?? 0;
          return last > 0 && performance.now() - last > quiet;
        }, QUIET_MS),
      { timeout: IGNITION_TIMEOUT_MS, intervals: [500] },
    )
    .toBe(true);
  const frames = await page.evaluate(() => (window as unknown as ProbeWindow).mapFrames);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return frames;
}

function report(rate: number, frames: readonly MapFrame[], light: boolean): void {
  const costs = frames.map((f) => f.cost).sort((a, b) => a - b);
  const gaps = frames.slice(1).map((f, i) => f.at - (frames[i]?.at ?? f.at));
  const long = gaps.filter((gap) => gap > LONG_FRAME_MS).length;
  test.info().annotations.push({
    type: 'frames',
    description:
      `${String(rate)}× CPU: ${String(frames.length)} map frames, median work ` +
      `${(costs[Math.floor(costs.length / 2)] ?? 0).toFixed(1)} ms, ${String(long)} gaps over ` +
      `${String(LONG_FRAME_MS)} ms (${((long / Math.max(1, gaps.length)) * 100).toFixed(0)}%), ` +
      `light mode ${light ? 'on' : 'off'}`,
  });
}

test.describe('knowledge map under CPU throttling', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'Desktop Chromium only: the map is desktop-only, CPU throttling is CDP.',
  );
  test.setTimeout(90_000);
  // One at a time: two throttled pages on one machine skew each other's frames.
  test.describe.configure({ mode: 'serial' });

  /** The detector's verdict must match the frames wherever they are clearly on one side. */
  function expectDetectorAgrees(frames: readonly MapFrame[], light: boolean): void {
    // The detector judges each animation on its own and leaves idle gaps out: split the frames
    // the same way (a gap over IDLE_GAP_MS ends one), and judge those of 1 s or more.
    const runs: MapFrame[][] = [];
    for (const [i, frame] of frames.entries()) {
      const gap = frame.at - (frames[i - 1]?.at ?? -Infinity);
      if (gap > IDLE_GAP_MS) runs.push([frame]);
      else runs.at(-1)?.push(frame);
    }
    const shares = runs
      .filter((run) => (run.at(-1)?.at ?? 0) - (run[0]?.at ?? 0) >= MIN_ANIMATION_MS)
      .map((run) => {
        const gaps = run.slice(1).map((f, i) => f.at - (run[i]?.at ?? f.at));
        return gaps.filter((gap) => gap > LONG_FRAME_MS).length / Math.max(1, gaps.length);
      });
    if (shares.some((share) => share > CLEARLY_SLOW)) {
      expect(light, 'a stuttering ignition turns light mode on').toBe(true);
    }
    if (shares.length > 0 && shares.every((share) => share < CLEARLY_SMOOTH)) {
      expect(light, 'a smooth ignition keeps the motion').toBe(false);
    }
  }

  test('at 4× CPU the map’s work fits a frame, and the detector agrees', async ({ page }) => {
    const frames = await answerAt(page, 4);
    const map = page.getByRole('region', { name: 'Knowledge map' });
    const light = (await map.getAttribute('data-slow-frames')) !== null;
    report(4, frames, light);

    const costs = frames.map((f) => f.cost).sort((a, b) => a - b);
    expect(costs.length).toBeGreaterThan(10);
    expect(costs[Math.floor(costs.length / 2)]).toBeLessThan(DRAW_BUDGET_MS);
    expectDetectorAgrees(frames, light);
  });

  test('at 6× CPU the detector agrees with the frames', async ({ page }) => {
    const frames = await answerAt(page, 6);
    const map = page.getByRole('region', { name: 'Knowledge map' });
    const light = (await map.getAttribute('data-slow-frames')) !== null;
    report(6, frames, light);

    expect(frames.length).toBeGreaterThan(0);
    expectDetectorAgrees(frames, light);
  });
});
