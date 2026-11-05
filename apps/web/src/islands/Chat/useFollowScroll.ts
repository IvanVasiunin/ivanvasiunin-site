// Autoscroll (SPEC US-A7): the page follows a streaming answer while the reader is at the bottom.
// Scrolling up pauses it and "Jump to latest" appears; returning to the bottom resumes it.
//
// What scrolls depends on the width (Chat.scss): from `md` the conversation scrolls inside the chat
// panel, so the input never has text behind it; below `md` it scrolls with the page, so the mobile
// browser's address bar and the keyboard behave as on any page. The hook asks the scroll area which
// case applies (its computed `overflow-y`) at every step, so a resize or rotation just works.
//
// Only the reader pauses it: following stops when the page moves *up* (or on an upward wheel / key /
// touch gesture, before the next token can pull the page back). Programmatic scrolls and a smooth
// "Jump to latest" only move down, so they never pause it by accident.
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

/** The scroll area when it scrolls itself (the panel from `md`), or null: the page scrolls. */
export function scrollingArea(area: HTMLElement | null): HTMLElement | null {
  if (area === null) return null;
  const { overflowY } = getComputedStyle(area);
  return overflowY === 'auto' || overflowY === 'scroll' ? area : null;
}

const sample = (area: HTMLElement | null, dock: HTMLElement | null): ScrollSample => {
  const box = scrollingArea(area);
  if (box !== null) {
    return {
      scrollY: box.scrollTop,
      distanceToBottom: box.scrollHeight - (box.scrollTop + box.clientHeight),
    };
  }
  // The page scrolls: "the bottom" is the end of the conversation, not of the document. Below the
  // input come the disclosure and the footer; a reader who sees the last answer above the input is at
  // the end even with the footer still below (Ivan, 2026-11-05: there, "Jump to latest" stayed and
  // the scrim blurred the disclosure). How far the conversation reaches under the input's top edge:
  // zero or less once the docked input has come to rest under the last answer.
  if (area !== null && dock !== null) {
    return {
      scrollY: window.scrollY,
      distanceToBottom: area.getBoundingClientRect().bottom - dock.getBoundingClientRect().top,
    };
  }
  return {
    scrollY: window.scrollY,
    distanceToBottom: document.documentElement.scrollHeight - (window.scrollY + window.innerHeight),
  };
};

const scrollToBottom = (area: HTMLElement | null, smooth: boolean): void => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = smooth && !reduce ? 'smooth' : 'instant';
  const box = scrollingArea(area);
  if (box !== null) {
    box.scrollTo({ top: box.scrollHeight, behavior });
    return;
  }
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
};

export interface FollowScroll {
  /** Whether the page follows new content (the reader is at the bottom). */
  readonly following: boolean;
  /** Scroll to the latest content and follow it again ("Jump to latest", a new question). */
  readonly jumpToLatest: (smooth?: boolean) => void;
  /** Stop following, as if the reader had scrolled up (a restored reading position). */
  readonly pause: () => void;
}

/**
 * @param content changes whenever new content arrives (the answer text, the number of turns); while
 * following, every change scrolls to the bottom.
 * @param active whether there is a conversation to follow. Without one nothing scrolls: on a page
 * taller than the screen (a phone) the empty chat would otherwise open scrolled to the bottom, with
 * the greeting under the header.
 * @param areaRef the conversation's scroll area (it scrolls by itself from `md`).
 * @param dockRef the docked input: below `md` the conversation counts as read to its end once its
 * last line is above the input's top edge.
 */
export function useFollowScroll(
  content: unknown,
  active = true,
  areaRef?: RefObject<HTMLElement | null>,
  dockRef?: RefObject<HTMLElement | null>,
): FollowScroll {
  const [following, setFollowing] = useState(true);
  // The same value for the handlers and the layout effect, written together with the state so it
  // is never a render behind.
  const followingRef = useRef(true);
  const setFollow = useCallback((value: boolean) => {
    followingRef.current = value;
    setFollowing(value);
  }, []);
  const last = useRef<ScrollSample | null>(null);

  useEffect(() => {
    const scrollArea = areaRef?.current ?? null;
    // Read at every sample, so a dock mounted later is never a stale node.
    const dock = (): HTMLElement | null => dockRef?.current ?? null;
    last.current = sample(scrollArea, dock());
    let touchY: number | null = null;
    const pause = (): void => {
      setFollow(false);
    };
    // When the panel's area scrolls by itself (from `md`), only gestures inside it concern the
    // conversation: a wheel over the header or the page must not pause it (Ivan, 2026-11-05).
    // When the page scrolls (below `md`), every gesture does.
    const concernsChat = (target: EventTarget | null): boolean => {
      const box = scrollingArea(scrollArea);
      return box === null || (target instanceof Node && box.contains(target));
    };
    const onScroll = (): void => {
      const current = sample(scrollArea, dock());
      const previous = last.current ?? current;
      last.current = current;
      setFollow(nextFollowing(followingRef.current, previous, current));
    };
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY < 0 && concernsChat(event.target)) pause();
    };
    const onTouchStart = (event: TouchEvent): void => {
      touchY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent): void => {
      const y = event.touches[0]?.clientY;
      // The finger moving down scrolls the page up.
      if (touchY !== null && y !== undefined && y > touchY && concernsChat(event.target)) pause();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      // Arrow keys inside the input move the caret, not the page.
      if (event.target instanceof HTMLTextAreaElement) return;
      if (UP_KEYS.has(event.key) && concernsChat(event.target)) pause();
    };
    const passive = { passive: true } as const;
    // Both: the page scrolls below `md`, the panel's area from `md` (a resize switches between them).
    window.addEventListener('scroll', onScroll, passive);
    scrollArea?.addEventListener('scroll', onScroll, passive);
    window.addEventListener('wheel', onWheel, passive);
    window.addEventListener('touchstart', onTouchStart, passive);
    window.addEventListener('touchmove', onTouchMove, passive);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', onScroll);
      scrollArea?.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [areaRef, dockRef, setFollow]);

  // New content while following: down to it before paint, so the new line never flashes below the
  // fold. Only when content changes, not when following switches on: a reader who wheels back near
  // the bottom, or a smooth "Jump to latest", must not be snapped to the end in one jump (Ivan,
  // 2026-11-05: both looked like a glitch).
  useLayoutEffect(() => {
    const scrollArea = areaRef?.current ?? null;
    const dock = dockRef?.current ?? null;
    if (active && followingRef.current && sample(scrollArea, dock).distanceToBottom > 0) {
      scrollToBottom(scrollArea, false);
    }
  }, [content, active, areaRef, dockRef]);

  const jumpToLatest = useCallback(
    (smooth = true) => {
      setFollow(true);
      scrollToBottom(areaRef?.current ?? null, smooth);
    },
    [areaRef, setFollow],
  );

  const pause = useCallback(() => {
    setFollow(false);
  }, [setFollow]);

  return { following, jumpToLatest, pause };
}
