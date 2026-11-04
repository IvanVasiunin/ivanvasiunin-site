// Autoscroll (SPEC US-A7): the page follows a streaming answer while the reader is at the bottom.
// Scrolling up pauses it and "Jump to latest" appears; returning to the bottom resumes it.
//
// The chat scrolls with the page (not in its own box), so the mobile browser's address bar and the
// keyboard behave as on any page; "the bottom" is the bottom of the document.
//
// Only the reader pauses it: following stops when the page moves *up* (or on an upward wheel / key /
// touch gesture, before the next token can pull the page back). Programmatic scrolls and a smooth
// "Jump to latest" only move down, so they never pause it by accident.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Within this distance of the bottom, the reader counts as "at the bottom" (px). */
export const FOLLOW_THRESHOLD_PX = 80;

const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);

export interface ScrollSample {
  readonly scrollY: number;
  /** The distance from the viewport's bottom edge to the bottom of the document (px). */
  readonly distanceToBottom: number;
}

/** Whether to follow after a scroll, from the previous position and the new one. */
export function nextFollowing(
  following: boolean,
  previous: ScrollSample,
  current: ScrollSample,
): boolean {
  if (current.distanceToBottom <= FOLLOW_THRESHOLD_PX) return true;
  if (current.scrollY < previous.scrollY) return false;
  return following;
}

const sample = (): ScrollSample => ({
  scrollY: window.scrollY,
  distanceToBottom: document.documentElement.scrollHeight - (window.scrollY + window.innerHeight),
});

const scrollToBottom = (smooth: boolean): void => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: smooth && !reduce ? 'smooth' : 'instant',
  });
};

export interface FollowScroll {
  /** Whether the page follows new content (the reader is at the bottom). */
  readonly following: boolean;
  /** Scroll to the latest content and follow it again ("Jump to latest", a new question). */
  readonly jumpToLatest: (smooth?: boolean) => void;
}

/**
 * @param content changes whenever new content arrives (the answer text, the number of turns); while
 * following, every change scrolls to the bottom.
 */
export function useFollowScroll(content: unknown): FollowScroll {
  const [following, setFollowing] = useState(true);
  const last = useRef<ScrollSample | null>(null);

  useEffect(() => {
    last.current = sample();
    let touchY: number | null = null;
    const pause = (): void => {
      setFollowing(false);
    };
    const onScroll = (): void => {
      const current = sample();
      const previous = last.current ?? current;
      last.current = current;
      setFollowing((now) => nextFollowing(now, previous, current));
    };
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY < 0) pause();
    };
    const onTouchStart = (event: TouchEvent): void => {
      touchY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent): void => {
      const y = event.touches[0]?.clientY;
      // The finger moving down scrolls the page up.
      if (touchY !== null && y !== undefined && y > touchY) pause();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      // Arrow keys inside the input move the caret, not the page.
      if (event.target instanceof HTMLTextAreaElement) return;
      if (UP_KEYS.has(event.key)) pause();
    };
    const passive = { passive: true } as const;
    window.addEventListener('scroll', onScroll, passive);
    window.addEventListener('wheel', onWheel, passive);
    window.addEventListener('touchstart', onTouchStart, passive);
    window.addEventListener('touchmove', onTouchMove, passive);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Before paint, so the new line never flashes below the fold first.
  useLayoutEffect(() => {
    if (following && sample().distanceToBottom > 0) scrollToBottom(false);
  }, [content, following]);

  const jumpToLatest = useCallback((smooth = true) => {
    setFollowing(true);
    scrollToBottom(smooth);
  }, []);

  return { following, jumpToLatest };
}
