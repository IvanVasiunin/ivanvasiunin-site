// Brings the reader back to where they were in the conversation (Ivan, 2026-11-05): a link in an
// answer opens the CV, and coming back to AI mode used to land at the end of the chat. On leaving the
// page the turn at the top of the visible area is stored (lib/chat/scroll-anchor.ts); when the stored
// conversation is restored, that turn goes back to the same place and following pauses ("Jump to
// latest" shows). A reader who left at the end stores nothing and comes back at the end.
//
// The visible area is the panel's scroll area from `md` and the window below it (useFollowScroll.ts).
// Below `md` the sticky header covers the window's top; the anchor is stored and restored against the
// same edge, so the turn comes back to exactly where it was all the same.
//
// When it is saved: on `pagehide`, and when the tab goes to the background (a phone may discard a
// hidden tab without a `pagehide`). Back to the foreground, or restored whole from the back/forward
// cache (DOM and scroll intact), the page forgets it: a later reload must not jump to an old place.
// When it is used: only on a page someone sees. `/` may be prerendered by the speculation rules and
// then thrown away; that copy must not use up the anchor (usePageReady.ts).
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

import { pickAnchor, saveAnchor, takeAnchor, type TurnBox } from '../../lib/chat/scroll-anchor';
import { scrollingArea } from './useFollowScroll';

type AnchorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface UseScrollAnchorOptions {
  /** The conversation's scroll area; its turns carry `data-turn-id`. */
  readonly areaRef: RefObject<HTMLElement | null>;
  /** Whether the reader is at the end, following new content. */
  readonly following: boolean;
  /** Stops following, so restoring the position is not undone by the next scroll to the end. */
  readonly pause: () => void;
  /** Counts the restores of a stored conversation (useChat.ts); 0 before the first. */
  readonly restored: number;
  /** Whether the page is shown to the visitor (not a prerendered copy yet). */
  readonly ready: boolean;
  /** Injected in tests; the tab's sessionStorage otherwise. */
  readonly storage?: () => AnchorStorage;
}

/** The top of the visible area, in viewport coordinates. */
const viewTop = (area: HTMLElement): number =>
  scrollingArea(area)?.getBoundingClientRect().top ?? 0;

const turnBoxes = (area: HTMLElement): TurnBox[] =>
  Array.from(area.querySelectorAll<HTMLElement>('[data-turn-id]'), (element) => {
    const box = element.getBoundingClientRect();
    return { id: element.dataset.turnId ?? '', top: box.top, bottom: box.bottom };
  }).filter((box) => box.id !== '');

const sessionAnchor = (): AnchorStorage => window.sessionStorage;

export function useScrollAnchor({
  areaRef,
  following,
  pause,
  restored,
  ready,
  storage = sessionAnchor,
}: UseScrollAnchorOptions): void {
  const followingRef = useRef(following);
  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    // Whether the anchor in storage is this page's own, saved when the tab went to the background.
    let savedOnHide = false;
    const save = (): void => {
      const area = areaRef.current;
      // A prerendered copy nobody has seen has no reading position, and must not overwrite the one
      // the visible page left for it.
      if (area === null || !readyRef.current) return;
      saveAnchor(followingRef.current ? null : pickAnchor(turnBoxes(area), viewTop(area)), storage);
    };
    const forget = (): void => {
      saveAnchor(null, storage);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        save();
        savedOnHide = readyRef.current;
        return;
      }
      // Only its own: a prerendered page turns visible on activation, before it uses the anchor
      // the previous page left.
      if (savedOnHide) forget();
      savedOnHide = false;
    };
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) forget();
    };
    window.addEventListener('pagehide', save);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', save);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [areaRef, storage]);

  // Before paint, after the follow hook's own layout effect has scrolled to the end (it is declared
  // first), so the restored chat is never seen at the end first. A prerendered copy waits until it is
  // shown (it is invisible until then, so the end is never seen there either).
  useLayoutEffect(() => {
    if (restored === 0 || !ready) return;
    const anchor = takeAnchor(storage);
    const area = areaRef.current;
    if (anchor === null || area === null) return;
    const turn = turnBoxes(area).find((box) => box.id === anchor.turnId);
    if (turn === undefined) return;
    pause();
    const delta = turn.top - viewTop(area) - anchor.offset;
    const box = scrollingArea(area);
    if (box === null) window.scrollBy({ top: delta, behavior: 'instant' });
    else box.scrollBy({ top: delta, behavior: 'instant' });
  }, [restored, ready, areaRef, pause, storage]);
}
