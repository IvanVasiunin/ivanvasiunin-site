// Elio's eyes follow the mouse (Ivan, 2026-11-05). One pointer listener for the whole page, whatever
// the number of avatars; each frame at most, every registered avatar gets its eye offset as two CSS
// custom properties, which ElioAvatar.scss turns into a `transform` (no React render per move).
//
// Only for a fine pointer that hovers (a mouse or trackpad) and without a reduced-motion preference;
// touch screens keep the eyes still. When the pointer leaves the window the eyes look ahead again.

/** How far the eyes may move from the centre, in the avatar's SVG units (its viewBox is 120). */
export const MAX_LOOK = 5;
/** From this distance (px) on, the eyes are fully turned; closer, they turn proportionally less. */
export const FULL_LOOK_PX = 240;
/**
 * Up and down a little more than sideways (Ivan, 2026-11-05: a glance up or down was hard to see,
 * one to the side was obvious). The visor leaves about 11 units above and below the eyes.
 */
export const VERTICAL_RATIO = 1.2;

export const LOOK_X = '--elio-avatar-look-x';
export const LOOK_Y = '--elio-avatar-look-y';
export const LOOK_QUERY =
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The eyes' offset (SVG units) for an avatar centred at `center` and a pointer at `pointer`. */
export function lookOffset(center: Point, pointer: Point): Point {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  const reach = (Math.min(distance, FULL_LOOK_PX) / FULL_LOOK_PX) * MAX_LOOK;
  return { x: (dx / distance) * reach, y: (dy / distance) * reach * VERTICAL_RATIO };
}

const avatars = new Set<Element & ElementCSSInlineStyle>();
let pointer: Point | null = null;
let frame = 0;
// Set before asking for a frame and cleared when it runs, so a frame that runs at once still leaves
// the next move free to ask for another one.
let pending = false;

function update(): void {
  pending = false;
  for (const avatar of avatars) {
    let offset: Point = { x: 0, y: 0 };
    if (pointer !== null) {
      const box = avatar.getBoundingClientRect();
      offset = lookOffset({ x: box.left + box.width / 2, y: box.top + box.height / 2 }, pointer);
    }
    // Custom properties only (react.md → Inline styles): the transform itself lives in the SCSS.
    avatar.style.setProperty(LOOK_X, offset.x.toFixed(2));
    avatar.style.setProperty(LOOK_Y, offset.y.toFixed(2));
  }
}

const schedule = (): void => {
  if (pending) return;
  pending = true;
  frame = requestAnimationFrame(update);
};

function onMove(event: PointerEvent): void {
  // A touch or pen "move" is a drag or a scroll, not someone looking around.
  if (event.pointerType !== '' && event.pointerType !== 'mouse') return;
  pointer = { x: event.clientX, y: event.clientY };
  schedule();
}

function onLeave(): void {
  pointer = null;
  schedule();
}

/**
 * Lets an avatar's eyes follow the pointer; returns the cleanup. Does nothing (and returns a no-op)
 * where the media query says there is no mouse or motion should be reduced.
 */
export function followPointer(avatar: Element & ElementCSSInlineStyle): () => void {
  if (!window.matchMedia(LOOK_QUERY).matches) return () => undefined;
  avatar.setAttribute('data-look', '');
  if (avatars.size === 0) {
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
  }
  avatars.add(avatar);
  schedule();
  return () => {
    avatars.delete(avatar);
    avatar.removeAttribute('data-look');
    if (avatars.size > 0) return;
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    cancelAnimationFrame(frame);
    pending = false;
    pointer = null;
  };
}
