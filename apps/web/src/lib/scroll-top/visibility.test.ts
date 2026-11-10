import { describe, expect, test, vi } from 'vitest';

import { initScrollTopVisibility, isNearTop, SHOW_FROM_SCREENS } from './visibility';

describe('isNearTop', () => {
  test('hides the rocket until half a screen of scrolling', () => {
    expect(SHOW_FROM_SCREENS).toBe(0.5);
    expect(isNearTop(0, 800)).toBe(true);
    expect(isNearTop(399, 800)).toBe(true);
    expect(isNearTop(400, 800)).toBe(false);
    expect(isNearTop(5000, 800)).toBe(false);
  });
});

function fakeWindow(supports: boolean, scrollY = 0) {
  const listeners = new Map<string, () => void>();
  const win = {
    scrollY,
    innerHeight: 800,
    CSS: { supports: vi.fn(() => supports) },
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    }),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
  };
  return { win, fire: (type: string) => listeners.get(type)?.() };
}

describe('initScrollTopVisibility', () => {
  test('does nothing where scroll-driven animations exist', () => {
    const link = document.createElement('a');
    const { win } = fakeWindow(true);
    initScrollTopVisibility(link, win);

    expect(link.hasAttribute('data-at-top')).toBe(false);
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  test('hides the rocket at the top and shows it after scrolling (Safari before 26)', () => {
    const link = document.createElement('a');
    const { win, fire } = fakeWindow(false);
    initScrollTopVisibility(link, win);

    expect(link.hasAttribute('data-at-top')).toBe(true);
    expect(link.inert).toBe(true);

    win.scrollY = 1200;
    fire('scroll');
    expect(link.hasAttribute('data-at-top')).toBe(false);
    expect(link.inert).toBe(false);

    // Back at the top, e.g. after a launch: hidden again.
    win.scrollY = 0;
    fire('scroll');
    expect(link.hasAttribute('data-at-top')).toBe(true);
    expect(link.inert).toBe(true);
  });
});
