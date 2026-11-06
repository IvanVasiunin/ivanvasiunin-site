import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useFollowScroll } from './useFollowScroll';

// `hold` (Ivan, 2026-11-06): the scroll that makes room for a folding Under the hood moves up; it
// must not count as the reader leaving the bottom ("Jump to latest" appeared at the bottom).

/** The page at `scrollY` in a document `scrollHeight` tall (jsdom does no layout). */
function pageAt(scrollY: number, scrollHeight: number): void {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
  window.dispatchEvent(new Event('scroll'));
}

// jsdom's window is 768 px tall: a document of 768 + 1000 px is at its end at scrollY 1000.
const END = 1000;
const TALL = window.innerHeight + END;

describe('useFollowScroll hold', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'scrollY');
    Reflect.deleteProperty(document.documentElement, 'scrollHeight');
  });

  it('without a hold, scrolling up from the bottom stops following', () => {
    const { result } = renderHook(() => useFollowScroll('answer'));
    act(() => {
      pageAt(END, TALL);
    });

    act(() => {
      pageAt(END - 400, TALL);
    });

    expect(result.current.following).toBe(false);
  });

  it('a held scroll up keeps following, and at the bottom after release it still follows', () => {
    const { result } = renderHook(() => useFollowScroll('answer'));
    act(() => {
      pageAt(END, TALL);
    });

    let release = (): void => undefined;
    act(() => {
      release = result.current.hold();
      // The room-making scroll: up by the panel's height while the panel is still there.
      pageAt(END - 400, TALL);
    });
    expect(result.current.following).toBe(true);

    act(() => {
      // The panel's space goes: the page is at its end again, without a scroll event.
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        value: TALL - 400,
        configurable: true,
      });
      release();
    });
    expect(result.current.following).toBe(true);
  });

  it('a reader gesture still pauses during a hold', () => {
    const { result } = renderHook(() => useFollowScroll('answer'));
    act(() => {
      pageAt(END, TALL);
    });

    act(() => {
      result.current.hold();
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    });

    expect(result.current.following).toBe(false);
  });

  it('releasing twice is harmless', () => {
    const { result } = renderHook(() => useFollowScroll('answer'));
    const release = result.current.hold();

    act(() => {
      release();
      release();
    });

    expect(result.current.following).toBe(true);
  });
});
