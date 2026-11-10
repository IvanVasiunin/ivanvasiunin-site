import { describe, expect, test, vi } from 'vitest';

import {
  DRAW_LINE,
  STAR_RANGE_PX,
  drawProgress,
  initTimelineFallback,
  starProgress,
} from './timeline-fallback';

const VIEWPORT = 1000;
const LINE = VIEWPORT * DRAW_LINE; // 650

describe('drawProgress', () => {
  test('is 0 until the reading line reaches the job, 1 once it has passed it', () => {
    expect(drawProgress(LINE + 10, 400, VIEWPORT)).toBe(0);
    expect(drawProgress(LINE, 400, VIEWPORT)).toBe(0);
    expect(drawProgress(LINE - 100, 400, VIEWPORT)).toBe(0.25);
    expect(drawProgress(LINE - 400, 400, VIEWPORT)).toBe(1);
    expect(drawProgress(-5000, 400, VIEWPORT)).toBe(1);
  });

  test('draws an empty box fully', () => {
    expect(drawProgress(LINE + 100, 0, VIEWPORT)).toBe(1);
  });
});

describe('starProgress', () => {
  test('lights the star over the first stretch past the line', () => {
    expect(starProgress(LINE + 1, VIEWPORT)).toBe(0);
    expect(starProgress(LINE - STAR_RANGE_PX / 2, VIEWPORT)).toBe(0.5);
    expect(starProgress(LINE - STAR_RANGE_PX, VIEWPORT)).toBe(1);
  });
});

function setup(options: { supports?: boolean; reduce?: boolean } = {}) {
  const job = document.createElement('li');
  let top = 900;
  job.getBoundingClientRect = () => ({ top, height: 400 }) as DOMRect;
  const listeners = new Map<string, () => void>();
  const win = {
    innerHeight: VIEWPORT,
    CSS: { supports: () => options.supports ?? false },
    matchMedia: () => ({ matches: options.reduce ?? false }),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
  };
  initTimelineFallback([job], win as unknown as Window);
  return {
    job,
    scrollTo: (next: number) => {
      top = next;
      listeners.get('scroll')?.();
    },
  };
}

describe('initTimelineFallback', () => {
  test('writes the progress on scroll (Safari before 26)', () => {
    const { job, scrollTo } = setup();
    expect(job.hasAttribute('data-timeline-fallback')).toBe(true);
    expect(job.style.getPropertyValue('--cv-job-draw')).toBe('0.000');
    expect(job.style.getPropertyValue('--cv-job-star')).toBe('0.000');

    scrollTo(LINE - 200);
    expect(job.style.getPropertyValue('--cv-job-draw')).toBe('0.500');
    expect(job.style.getPropertyValue('--cv-job-star')).toBe('1.000');
  });

  test.each([
    ['scroll-driven animations exist', { supports: true }],
    ['reduced motion is preferred', { reduce: true }],
  ])('leaves the line fully drawn when %s', (_name, options) => {
    const { job } = setup(options);
    expect(job.hasAttribute('data-timeline-fallback')).toBe(false);
    expect(job.style.getPropertyValue('--cv-job-draw')).toBe('');
  });
});
