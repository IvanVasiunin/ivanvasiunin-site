import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ascent,
  ASCENT_MS,
  FADE_SHARE,
  IGNITION_MS,
  initScrollTop,
  isPlainClick,
  pageScroll,
  rocketOpacity,
} from './launch';

describe('ascent', () => {
  test('starts slowly and accelerates, from 0 to 1', () => {
    expect(ascent(0)).toBe(0);
    expect(ascent(1)).toBe(1);
    // Slow off the pad: a quarter of the time covers far less than a quarter of the way.
    expect(ascent(0.25)).toBeLessThan(0.05);
    // Accelerating: each next quarter covers more than the one before.
    const steps = [0, 0.25, 0.5, 0.75, 1].map(ascent);
    const gains = steps.slice(1).map((value, index) => value - (steps[index] ?? 0));
    expect(gains).toEqual([...gains].sort((a, b) => a - b));
  });

  test('clamps outside 0..1', () => {
    expect(ascent(-1)).toBe(0);
    expect(ascent(2)).toBe(1);
  });
});

describe('rocketOpacity', () => {
  test('is opaque until the last stretch before the top edge, then fades to 0', () => {
    const toTop = 1000;
    expect(rocketOpacity(0, toTop)).toBe(1);
    expect(rocketOpacity(toTop * (1 - FADE_SHARE), toTop)).toBe(1);
    expect(rocketOpacity(toTop * (1 - FADE_SHARE / 2), toTop)).toBeCloseTo(0.5);
    expect(rocketOpacity(toTop, toTop)).toBe(0);
    expect(rocketOpacity(toTop * 1.2, toTop)).toBe(0);
  });
});

describe('pageScroll', () => {
  test('follows the rocket from the reader position to the top', () => {
    expect(pageScroll(3000, 0)).toBe(3000);
    expect(pageScroll(3000, 0.5)).toBe(1500);
    expect(pageScroll(3000, 1)).toBe(0);
  });
});

describe('initScrollTop', () => {
  let frames: FrameRequestCallback[] = [];

  function setup({ reducedMotion = false, scrollY = 3000 } = {}) {
    document.body.innerHTML = `
      <main id="main" tabindex="-1"></main>
      <a href="#top" data-scroll-top><svg data-scroll-top-rocket></svg></a>
    `;
    const link = document.querySelector<HTMLAnchorElement>('[data-scroll-top]');
    const rocket = document.querySelector<SVGElement>('[data-scroll-top-rocket]');
    if (!link || !rocket) throw new Error('fixture');
    rocket.getBoundingClientRect = () => ({ bottom: 800, height: 90 }) as DOMRect;
    const scrollTo = vi.fn();
    const win = {
      document,
      scrollY,
      matchMedia: (query: string) => ({ matches: reducedMotion && query.includes('reduce') }),
      scrollTo,
      setTimeout: window.setTimeout.bind(window),
      requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
    } as unknown as Window;
    initScrollTop(link, win);
    return { link, rocket, scrollTo };
  }

  /** Runs the queued animation frame at `time` ms. */
  const runFrame = (time: number): void => {
    const queued = frames;
    frames = [];
    for (const callback of queued) callback(time);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('ignites on the pad first: no movement, no scroll', () => {
    const { link, rocket, scrollTo } = setup();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(link.dataset.state).toBe('ignition');
    vi.advanceTimersByTime(IGNITION_MS - 1);
    expect(frames).toHaveLength(0);
    expect(rocket.style.transform).toBe('');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test('then lifts off slowly, pulls the page up on the same curve, fades out and lands focus on main', () => {
    const { link, rocket, scrollTo } = setup();
    link.click();
    vi.advanceTimersByTime(IGNITION_MS);
    expect(link.dataset.state).toBe('ascent');

    runFrame(0);
    runFrame(ASCENT_MS / 4);
    const early = scrollTo.mock.lastCall?.[0] as { top: number };
    expect(early.top).toBeGreaterThan(3000 * 0.95); // still close to where the reader was
    expect(rocket.style.opacity).toBe('1');

    runFrame(ASCENT_MS / 2);
    runFrame(ASCENT_MS);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    expect(link.dataset.state).toBeUndefined();
    expect(rocket.style.transform).toBe('');
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  test('a wheel during the ascent hands the scroll back to the reader', () => {
    const { link, scrollTo } = setup();
    link.click();
    vi.advanceTimersByTime(IGNITION_MS);
    runFrame(0);
    const calls = scrollTo.mock.calls.length;
    window.dispatchEvent(new Event('wheel'));
    runFrame(ASCENT_MS / 2);

    expect(scrollTo.mock.calls.length).toBe(calls);
  });

  test('ignores clicks during a launch', () => {
    const { link } = setup();
    link.click();
    link.click();
    vi.advanceTimersByTime(IGNITION_MS);

    expect(frames).toHaveLength(1);
  });

  test('with reduced motion, jumps to the top at once without a launch', () => {
    const { link, scrollTo } = setup({ reducedMotion: true });
    link.click();

    expect(link.dataset.state).toBeUndefined();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  test('leaves modified clicks (new tab, new window) to the browser', () => {
    const { link, scrollTo } = setup();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(link.dataset.state).toBeUndefined();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('isPlainClick', () => {
  test('is true only for an unmodified primary click', () => {
    expect(isPlainClick(new MouseEvent('click', { button: 0 }))).toBe(true);
    expect(isPlainClick(new MouseEvent('click', { button: 1 }))).toBe(false);
    expect(isPlainClick(new MouseEvent('click', { shiftKey: true }))).toBe(false);
    expect(isPlainClick(new MouseEvent('click', { metaKey: true }))).toBe(false);
  });
});

describe('launch timing and the CSS tokens', () => {
  const tokens = readFileSync(path.join(process.cwd(), 'src/styles/tokens.scss'), 'utf8');
  const ms = (name: string): number => {
    const match = new RegExp(`--${name}:\\s*(\\d+)ms`).exec(tokens);
    if (!match?.[1]) throw new Error(`token --${name} not found`);
    return Number(match[1]);
  };

  test('IGNITION_MS is the --duration-ignition token (the CSS flame and smoke)', () => {
    expect(ms('duration-ignition')).toBe(IGNITION_MS);
  });
});
