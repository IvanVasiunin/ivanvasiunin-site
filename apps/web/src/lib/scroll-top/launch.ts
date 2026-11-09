// "Back to top" launch (ROADMAP 2.6, src/components/ScrollTop). The rocket is the link; it works
// without JS (`#top`). With JS, a plain click launches it like a real rocket:
//   1. ignition (`data-state="ignition"`): the engine lights, smoke billows, the rocket shudders on the
//      pad (CSS, ScrollTop.scss);
//   2. ascent (`data-state="ascent"`): the rocket lifts off slowly and accelerates, and the page scrolls
//      up with it on the same curve, slow first, then faster; near the top edge the rocket fades out.
// The ascent is driven frame by frame (requestAnimationFrame, transform / opacity only), because the
// page scroll has to follow the rocket. A wheel or touch during the ascent hands the scroll back to the
// reader (the rocket still flies). At the end focus goes to <main>, so keyboard users are not left on a
// control that hides at the top. With reduced motion there is no launch: the page jumps to the top.

/** Ignition: the rocket stays on the pad while the engine lights. Keep in step with `--duration-ignition`. */
export const IGNITION_MS = 500;
/** Ascent: from lift-off until the rocket has left the screen and the page is at the top. */
export const ASCENT_MS = 1700;
/** How sharply the ascent accelerates: progress^ACCELERATION (1 would be constant speed). */
export const ACCELERATION = 2.6;
/** The rocket fades out over this last share of its way to the top edge of the screen. */
export const FADE_SHARE = 0.3;

/** Eased ascent progress: slow off the pad, then faster and faster. 0..1 → 0..1. */
export function ascent(progress: number): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return clamped ** ACCELERATION;
}

/**
 * The rocket's opacity for how far it has flown: 1 until the last `FADE_SHARE` of its way to the top
 * of the screen, then down to 0 as it leaves. `travelled` and `toTop` are distances in px.
 */
export function rocketOpacity(travelled: number, toTop: number): number {
  if (toTop <= 0) return 0;
  const left = (toTop - travelled) / (toTop * FADE_SHARE);
  return Math.min(Math.max(left, 0), 1);
}

/** The page scroll position for the eased progress: from where the reader was to the top. */
export function pageScroll(startY: number, eased: number): number {
  return Math.round(startY * (1 - eased));
}

/** A click the link should handle itself: primary button, no modifier (new tab / window stay native). */
export function isPlainClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

type LaunchWindow = Pick<
  Window,
  | 'matchMedia'
  | 'scrollTo'
  | 'scrollY'
  | 'setTimeout'
  | 'requestAnimationFrame'
  | 'document'
  | 'addEventListener'
  | 'removeEventListener'
>;

export function initScrollTop(link: HTMLAnchorElement, win: LaunchWindow): void {
  const rocket = link.querySelector<SVGElement>('[data-scroll-top-rocket]');

  const land = (): void => {
    delete link.dataset.state;
    rocket?.style.removeProperty('transform');
    rocket?.style.removeProperty('opacity');
    win.document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
  };

  const fly = (): void => {
    link.dataset.state = 'ascent';
    const startY = win.scrollY;
    // From its place to fully above the screen, with its flame.
    const box = rocket?.getBoundingClientRect();
    const toTop = box ? box.bottom : 0;
    const distance = box ? box.bottom + box.height / 2 : 0;
    let followPage = startY > 0;
    const release = (): void => {
      followPage = false;
    };
    win.addEventListener('wheel', release, { passive: true, once: true });
    win.addEventListener('touchstart', release, { passive: true, once: true });

    let start: number | null = null;
    const frame = (now: number): void => {
      start ??= now;
      const progress = Math.min((now - start) / ASCENT_MS, 1);
      const eased = ascent(progress);
      const travelled = eased * distance;
      if (rocket) {
        rocket.style.transform = `translateY(${String(-travelled)}px)`;
        rocket.style.opacity = String(rocketOpacity(travelled, toTop));
      }
      if (followPage) win.scrollTo({ top: pageScroll(startY, eased), behavior: 'instant' });
      if (progress < 1) {
        win.requestAnimationFrame(frame);
        return;
      }
      win.removeEventListener('wheel', release);
      win.removeEventListener('touchstart', release);
      land();
    };
    win.requestAnimationFrame(frame);
  };

  link.addEventListener('click', (event) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    if (link.dataset.state) return; // one launch at a time

    if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      win.scrollTo({ top: 0, behavior: 'instant' });
      land();
      return;
    }

    link.dataset.state = 'ignition';
    win.setTimeout(fly, IGNITION_MS);
  });
}
