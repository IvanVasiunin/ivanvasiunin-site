// Scrolling the conversation (SPEC US-A7). What scrolls depends on the width (Chat.scss): from `md`
// the conversation scrolls inside the chat panel, so the input never has text behind it; below `md`
// it scrolls with the page, so the mobile browser's address bar and the keyboard behave as on any
// page. The hook asks the scroll area which case applies (its computed `overflow-y`) at every step,
// so a resize or rotation just works.
//
// From `md` (the panel): the area follows a streaming answer while the reader is at the bottom.
// Scrolling up pauses it and "Jump to latest" appears; returning to the bottom resumes it. Only the
// reader pauses it: following stops when the area moves *up* (or on an upward wheel / key / touch
// gesture, before the next token can pull it back).
//
// Below `md` (the page; Ivan, 2026-11-10, on a real phone):
// - a new question goes to the top of the screen and its answer is written below it; the page does
//   not chase the answer's end, so a long answer is read from its start;
// - "Jump to latest" shows from the position alone: while the conversation goes on below the docked
//   input. No gestures: on a phone a swipe paused following and the next scroll event resumed it, so
//   the button blinked on and off (over Under the hood, by Copy / Retry). A margin between "show"
//   and "hide" keeps a bouncing page from blinking it too;
// - the end of the conversation is its last line resting on the input, not the end of the document
//   (the jump used to scroll to the footer: half a screen of nothing);
// - `covered` says text passes behind the docked input, for the scrim: in a conversation while the
//   reader is away from its end, before one while the topic cards reach under it.
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Within this distance of the bottom, the reader counts as "at the bottom" (px). */
export const FOLLOW_THRESHOLD_PX = 80;

/** Below `md`: "Jump to latest" shows only this much farther from the end than where it hides (px). */
export const SHOW_MARGIN_PX = 48;

/** Below `md`: the gap the end of the conversation keeps above the docked input after a jump (px). */
export const END_GAP_PX = 12;

/** Below `md`: text this far behind the input's top edge counts as passing behind it (px). */
export const COVER_THRESHOLD_PX = 4;

const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);

export interface ScrollSample {
  readonly scrollY: number;
  /** The distance from the visible bottom to the end of the conversation (px). */
  readonly distanceToBottom: number;
}

/** From `md`: whether to follow after a scroll, from the previous position and the new one. */
export function nextFollowing(
  following: boolean,
  previous: ScrollSample,
  current: ScrollSample,
): boolean {
  if (current.distanceToBottom <= FOLLOW_THRESHOLD_PX) return true;
  if (current.scrollY < previous.scrollY) return false;
  return following;
}

/**
 * Below `md`: whether the reader is at the end (no "Jump to latest"), from the position alone. Between
 * the two thresholds the previous answer holds, so a page bouncing at the edge never blinks the button.
 */
export function atEnd(previous: boolean, distanceToBottom: number): boolean {
  if (distanceToBottom <= FOLLOW_THRESHOLD_PX) return true;
  if (distanceToBottom > FOLLOW_THRESHOLD_PX + SHOW_MARGIN_PX) return false;
  return previous;
}

/** The scroll area when it scrolls itself (the panel from `md`), or null: the page scrolls. */
export function scrollingArea(area: HTMLElement | null): HTMLElement | null {
  if (area === null) return null;
  const { overflowY } = getComputedStyle(area);
  return overflowY === 'auto' || overflowY === 'scroll' ? area : null;
}

/**
 * Below `md`, the bottom of what there is to read: the latest turn's last part (its answer, sources
 * and actions), not the turn's box, which is kept a screen tall (Chat.scss) and ends in empty sky;
 * without a conversation, the scroll area (the topic cards).
 */
const contentBottom = (area: HTMLElement): number => {
  const turns = area.querySelectorAll<HTMLElement>('[data-turn-id]');
  const latest = turns[turns.length - 1];
  return (latest?.lastElementChild ?? area).getBoundingClientRect().bottom;
};

/**
 * Below `md`, how far the conversation reaches under the docked input's top edge: zero or less once
 * its last line rests above the input (the disclosure and the footer may still be below; Ivan,
 * 2026-11-05: a reader who sees the last answer above the input is at the end).
 */
const pageDistance = (area: HTMLElement, dock: HTMLElement | null): number =>
  dock === null
    ? document.documentElement.scrollHeight - (window.scrollY + window.innerHeight)
    : contentBottom(area) - dock.getBoundingClientRect().top;

const sample = (area: HTMLElement | null, dock: HTMLElement | null): ScrollSample => {
  const box = scrollingArea(area);
  if (box !== null) {
    return {
      scrollY: box.scrollTop,
      distanceToBottom: box.scrollHeight - (box.scrollTop + box.clientHeight),
    };
  }
  return {
    scrollY: window.scrollY,
    distanceToBottom:
      area === null
        ? document.documentElement.scrollHeight - (window.scrollY + window.innerHeight)
        : pageDistance(area, dock),
  };
};

const behaviorFor = (smooth: boolean): ScrollBehavior =>
  smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant';

/** To the end of the conversation: the panel's bottom, or (the page) its last line on the input. */
const scrollToEnd = (area: HTMLElement | null, dock: HTMLElement | null, smooth: boolean): void => {
  const behavior = behaviorFor(smooth);
  const box = scrollingArea(area);
  if (box !== null) {
    box.scrollTo({ top: box.scrollHeight, behavior });
    return;
  }
  if (area === null) {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
    return;
  }
  window.scrollBy({ top: pageDistance(area, dock) + END_GAP_PX, behavior });
};

export interface FollowScroll {
  /** Whether the reader is at the end of the conversation (no "Jump to latest"). */
  readonly following: boolean;
  /** Below `md`: whether text passes behind the docked input (the scrim shows). */
  readonly covered: boolean;
  /** Scroll to the latest content and follow it again ("Jump to latest"). */
  readonly jumpToLatest: (smooth?: boolean) => void;
  /**
   * A question was sent: from `md` the panel follows its answer; below `md` the question goes to the
   * top of the screen once it is rendered, and the page stays there while the answer is written.
   */
  readonly revealLatest: () => void;
  /** Stop following, as if the reader had scrolled up (a restored reading position). */
  readonly pause: () => void;
}

/**
 * @param content changes whenever new content arrives (the answer text, the number of turns).
 * @param active whether there is a conversation to follow. Without one nothing scrolls: on a page
 * taller than the screen (a phone) the empty chat would otherwise open scrolled to the bottom, with
 * the greeting under the header.
 * @param areaRef the conversation's scroll area (it scrolls by itself from `md`); its turns carry
 * `data-turn-id`.
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
  const [covered, setCovered] = useState(false);
  // Whether new content scrolls the view to the end. From `md` the same as `following`. Below `md`
  // only after "Jump to latest" or on arrival (a restored conversation opens at its end) until the
  // reader scrolls up or sends a question; never shown, so it is only a ref.
  const autoFollow = useRef(true);
  // The same value for the handlers and the layout effect, written together with the state so it
  // is never a render behind.
  const followingRef = useRef(true);
  const setFollow = useCallback((value: boolean) => {
    followingRef.current = value;
    setFollowing(value);
  }, []);
  // Below `md`, a question was sent while this many turns were shown: the next turn beyond them goes
  // to the top. Only a turn that really arrived: a send that added none (an empty input) must not
  // leave it armed, or a later token would jump the page in the middle of reading (review).
  const pendingReveal = useRef<number | null>(null);
  const last = useRef<ScrollSample | null>(null);

  useEffect(() => {
    const scrollArea = areaRef?.current ?? null;
    // Read at every sample, so a dock mounted later is never a stale node.
    const dock = (): HTMLElement | null => dockRef?.current ?? null;
    last.current = sample(scrollArea, dock());
    let touchY: number | null = null;
    const inPanel = (): boolean => scrollingArea(scrollArea) !== null;

    // Below `md`: everything from the position, measured again on every scroll and resize.
    const measurePage = (): void => {
      if (scrollArea === null) return;
      const distance = pageDistance(scrollArea, dock());
      const end = atEnd(followingRef.current, distance);
      setFollow(end);
      // In a conversation the scrim goes with "Jump to latest": at its end the docked input may sit
      // a few px over the last answer's edge near the footer (it sticks above its place there), and
      // a scrim over the disclosure was the bug of 2026-11-05. Before one, any overlap: the cards.
      const conversation = scrollArea.querySelector('[data-turn-id]') !== null;
      setCovered(conversation ? !end : distance > COVER_THRESHOLD_PX);
    };

    const pause = (): void => {
      autoFollow.current = false;
      setFollow(false);
    };
    // Gestures pause the panel only, and only gestures inside it concern the conversation: a wheel
    // over the header or the page must not pause it (Ivan, 2026-11-05).
    const concernsPanel = (target: EventTarget | null): boolean => {
      const box = scrollingArea(scrollArea);
      return box !== null && target instanceof Node && box.contains(target);
    };
    const onScroll = (): void => {
      const current = sample(scrollArea, dock());
      const previous = last.current ?? current;
      last.current = current;
      if (inPanel()) {
        const next = nextFollowing(followingRef.current, previous, current);
        autoFollow.current = next;
        setFollow(next);
        setCovered(false);
        return;
      }
      if (current.scrollY < previous.scrollY) autoFollow.current = false;
      measurePage();
    };
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY < 0 && concernsPanel(event.target)) pause();
    };
    const onTouchStart = (event: TouchEvent): void => {
      touchY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent): void => {
      const y = event.touches[0]?.clientY;
      // The finger moving down scrolls up.
      if (touchY !== null && y !== undefined && y > touchY && concernsPanel(event.target)) pause();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      // Arrow keys inside the input move the caret, not the page.
      if (event.target instanceof HTMLTextAreaElement) return;
      if (UP_KEYS.has(event.key) && concernsPanel(event.target)) pause();
    };
    // New content grows the area without a scroll: below `md` the position is measured again.
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (!inPanel()) measurePage();
          });
    if (scrollArea !== null) resize?.observe(scrollArea);
    if (!inPanel()) measurePage();

    const passive = { passive: true } as const;
    // Both: the page scrolls below `md`, the panel's area from `md` (a resize switches between them).
    window.addEventListener('scroll', onScroll, passive);
    window.addEventListener('resize', onScroll, passive);
    scrollArea?.addEventListener('scroll', onScroll, passive);
    window.addEventListener('wheel', onWheel, passive);
    window.addEventListener('touchstart', onTouchStart, passive);
    window.addEventListener('touchmove', onTouchMove, passive);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      resize?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      scrollArea?.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [areaRef, dockRef, setFollow]);

  // New content: before paint, so a new line never flashes below the fold. A question just sent goes
  // to the top first (below `md`). Then, while following, down to the end. Only when content changes,
  // not when following switches on: a reader who wheels back near the bottom, or a smooth "Jump to
  // latest", must not be snapped to the end in one jump (Ivan, 2026-11-05: both looked like a glitch).
  useLayoutEffect(() => {
    const scrollArea = areaRef?.current ?? null;
    const dock = dockRef?.current ?? null;
    if (!active) return;
    const turns = scrollArea?.querySelectorAll<HTMLElement>('[data-turn-id]');
    if (pendingReveal.current !== null && turns !== undefined) {
      const latest = turns[turns.length - 1];
      if (latest === undefined || turns.length <= pendingReveal.current) return;
      pendingReveal.current = null;
      // The root's scroll padding keeps it clear of the sticky header (base.scss).
      latest.scrollIntoView({ block: 'start', behavior: behaviorFor(true) });
      return;
    }
    if (autoFollow.current && sample(scrollArea, dock).distanceToBottom > 0) {
      scrollToEnd(scrollArea, dock, false);
    }
  }, [content, active, areaRef, dockRef]);

  const jumpToLatest = useCallback(
    (smooth = true) => {
      autoFollow.current = true;
      setFollow(true);
      scrollToEnd(areaRef?.current ?? null, dockRef?.current ?? null, smooth);
    },
    [areaRef, dockRef, setFollow],
  );

  const revealLatest = useCallback(() => {
    if (scrollingArea(areaRef?.current ?? null) !== null) {
      jumpToLatest(false);
      return;
    }
    autoFollow.current = false;
    pendingReveal.current = areaRef?.current?.querySelectorAll('[data-turn-id]').length ?? 0;
  }, [areaRef, jumpToLatest]);

  const pause = useCallback(() => {
    autoFollow.current = false;
    setFollow(false);
  }, [setFollow]);

  return { following, covered, jumpToLatest, revealLatest, pause };
}
