// Closing a panel without a jump (Ivan, 2026-11-06: Under the hood jumped right at the end of its
// closing animation). The animation moves only the panel's picture (transform / opacity,
// css-scss.md → Motion); its space goes at once when it is hidden. If the reader has scrolled near
// the end, the content is suddenly shorter than the scroll position, the browser clamps the
// position, and everything leaps down by up to the panel's height.
//
// The cure: while the panel fades, scroll smoothly by exactly the amount the clamp would take, so
// that when the space goes, nothing moves.

/** What scrolls `element`: its nearest scrollable ancestor (the chat panel from `md`), or the page. */
export function scrollContainer(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    const scrolls = overflowY === 'auto' || overflowY === 'scroll';
    if (scrolls && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

/** How far up `container` must scroll so that removing `height` px of content does not clamp it. */
export function clampDistance(
  container: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
  height: number,
): number {
  const maxAfter = container.scrollHeight - height - container.clientHeight;
  return Math.max(0, container.scrollTop - Math.max(0, maxAfter));
}

/**
 * The space `element` takes in its parent: its height plus the gap before it, which goes with it
 * in a flex or grid column (the answer card's gap: 12 px of jump were left without it).
 */
export function takenHeight(element: HTMLElement): number {
  const parent = element.parentElement;
  const gap = parent === null ? 0 : Number.parseFloat(getComputedStyle(parent).rowGap);
  return element.offsetHeight + (Number.isNaN(gap) ? 0 : gap);
}

/** The longest a smooth scroll is waited for when the browser has no `scrollend` event. */
export const SCROLL_END_FALLBACK_MS = 600;

/**
 * Starts a smooth scroll that makes room for `panel` to disappear; calls `done` when it has ended
 * (at once when no scroll is needed). Returns a cancel function for unmount.
 */
export function scrollBeforeCollapse(panel: HTMLElement, done: () => void): () => void {
  const container = scrollContainer(panel);
  const distance = clampDistance(container, takenHeight(panel));
  if (distance === 0) {
    done();
    return () => undefined;
  }
  // The page reports `scrollend` on the window, a scrolling element on itself.
  const target: EventTarget = container === document.scrollingElement ? window : container;
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    target.removeEventListener('scrollend', finish);
    window.clearTimeout(timer);
    done();
  };
  target.addEventListener('scrollend', finish);
  const timer = window.setTimeout(finish, SCROLL_END_FALLBACK_MS);
  container.scrollBy({ top: -distance, behavior: 'smooth' });
  return () => {
    finished = true;
    target.removeEventListener('scrollend', finish);
    window.clearTimeout(timer);
  };
}
