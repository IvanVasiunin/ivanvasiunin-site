// "Back to top" visibility where scroll-driven animations do not exist (Safari before 26; Ivan,
// 2026-11-10: on iOS 18 the rocket stood there even at the very top, and after a launch it flew away
// and came straight back). ScrollTop.scss shows the rocket with a scroll-linked animation where the
// browser has one; here a scroll listener sets `data-at-top` instead, and `inert` keeps the hidden
// link out of the Tab order and the accessibility tree. Without JS the rocket is simply always there.

/** The rocket shows once the page has scrolled this share of a screen (the middle of the CSS range). */
export const SHOW_FROM_SCREENS = 0.5;

/** Whether the page is near enough the top that the rocket hides. */
export function isNearTop(scrollY: number, viewportHeight: number): boolean {
  return scrollY < viewportHeight * SHOW_FROM_SCREENS;
}

type VisibilityWindow = Pick<
  Window,
  'scrollY' | 'innerHeight' | 'addEventListener' | 'requestAnimationFrame'
> & { readonly CSS?: Pick<typeof CSS, 'supports'> };

/** Starts the fallback, or does nothing where the CSS animation does the job. */
export function initScrollTopVisibility(link: HTMLElement, win: VisibilityWindow): void {
  if (win.CSS?.supports('animation-timeline: scroll()') === true) return;

  let queued = false;
  const update = (): void => {
    queued = false;
    const hidden = isNearTop(win.scrollY, win.innerHeight);
    link.toggleAttribute('data-at-top', hidden);
    link.inert = hidden;
  };
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(update);
  };

  update();
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule, { passive: true });
}
