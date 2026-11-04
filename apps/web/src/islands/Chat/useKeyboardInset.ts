// The virtual keyboard on mobile (SPEC US-A1, mobile-performance.md): the composer must stay above it.
//
// Android Chrome resizes the layout viewport for the keyboard (`interactive-widget=resizes-content`
// in the viewport meta), so sticky elements stay visible on their own. iOS Safari does not: the
// keyboard only shrinks the *visual* viewport, and a bottom-sticky composer ends up behind it. This
// hook measures how much of the layout viewport the keyboard covers and publishes it as
// `--keyboard-inset` on <html>, which the dock adds to its bottom offset.
//
// "Open" also covers Android, where nothing is covered: the input has focus on a touch screen. While
// open, `data-keyboard-open` on <html> hides the floating mode switch (styles/utilities.scss) and
// `--bottom-bar-space: 0px` drops the room the dock keeps for it (ROADMAP 3.9).
import { type RefObject, useEffect } from 'react';

/** Smaller differences are browser chrome (the address bar), not a keyboard (px). */
export const KEYBOARD_MIN_PX = 120;

export function keyboardInset(
  layoutHeight: number,
  viewport: Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'>,
): number {
  // A pinch zoom shrinks the visual viewport too; that is not a keyboard.
  if (viewport.scale > 1) return 0;
  const covered = layoutHeight - viewport.height - viewport.offsetTop;
  return covered >= KEYBOARD_MIN_PX ? Math.round(covered) : 0;
}

export function useKeyboardInset(input: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    // `null` in the spec, but missing altogether in older browsers (and jsdom).
    const viewport = window.visualViewport as VisualViewport | null | undefined;
    const root = document.documentElement;
    const touch = window.matchMedia('(pointer: coarse)');
    let frame = 0;

    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = viewport ? keyboardInset(window.innerHeight, viewport) : 0;
        const typing = touch.matches && document.activeElement === input.current;
        const open = inset > 0 || typing;
        root.style.setProperty('--keyboard-inset', `${String(inset)}px`);
        root.toggleAttribute('data-keyboard-open', open);
        if (open) root.style.setProperty('--bottom-bar-space', '0px');
        else root.style.removeProperty('--bottom-bar-space');
      });
    };

    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      cancelAnimationFrame(frame);
      root.style.removeProperty('--keyboard-inset');
      root.style.removeProperty('--bottom-bar-space');
      root.removeAttribute('data-keyboard-open');
    };
  }, [input]);
}
