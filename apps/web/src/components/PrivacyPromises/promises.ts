// The privacy card's promises (PrivacyPromises.astro): one shows at a time; they turn on their own
// every few seconds. WCAG 2.2.2 (Pause, Stop, Hide): a Pause button stops the turning, and hovering or
// focusing the card holds it while the visitor reads or uses the controls. With reduced motion the
// promises never turn on their own. A hidden tab holds them too.

/** How long one promise stays before the next (long enough to read the longest one twice). */
export const PROMISE_INTERVAL_MS = 5000;

export interface PromisesOptions {
  /** `prefers-reduced-motion: reduce`: start paused. */
  readonly reducedMotion: boolean;
}

/** Wires the controls of one card; returns a function that stops it (for tests). */
export function startPromises(root: HTMLElement, { reducedMotion }: PromisesOptions): () => void {
  const says = [...root.querySelectorAll<HTMLElement>('.privacy-promises__say')];
  const dots = [...root.querySelectorAll<HTMLButtonElement>('.privacy-promises__dot')];
  const pause = root.querySelector<HTMLButtonElement>('[data-privacy-promises-pause]');
  const controls = root.querySelector<HTMLElement>('[data-privacy-promises-controls]');
  if (says.length < 2 || dots.length !== says.length || !pause || !controls) return () => undefined;

  let current = Math.max(
    0,
    says.findIndex((say) => say.hasAttribute('data-current')),
  );
  let paused = reducedMotion;
  let held = false; // hover or focus inside the card
  let timer = 0;

  const show = (index: number): void => {
    current = index;
    says.forEach((say, i) => say.toggleAttribute('data-current', i === index));
    dots.forEach((dot, i) => {
      dot.setAttribute('aria-pressed', String(i === index));
    });
  };

  const schedule = (): void => {
    window.clearTimeout(timer);
    if (paused || held || document.hidden) return;
    timer = window.setTimeout(() => {
      show((current + 1) % says.length);
      schedule();
    }, PROMISE_INTERVAL_MS);
  };

  const setPaused = (value: boolean): void => {
    paused = value;
    pause.setAttribute('aria-pressed', String(value));
    pause.setAttribute('aria-label', value ? 'Play the promises' : 'Pause the promises');
    schedule();
  };

  const hold = (value: boolean): void => {
    held = value;
    schedule();
  };

  const controller = new AbortController();
  const { signal } = controller;
  dots.forEach((dot, i) => {
    dot.addEventListener(
      'click',
      () => {
        show(i);
        schedule();
      },
      { signal },
    );
  });
  pause.addEventListener(
    'click',
    () => {
      setPaused(!paused);
    },
    { signal },
  );
  root.addEventListener(
    'pointerenter',
    () => {
      hold(true);
    },
    { signal },
  );
  root.addEventListener(
    'pointerleave',
    () => {
      hold(false);
    },
    { signal },
  );
  root.addEventListener(
    'focusin',
    () => {
      hold(true);
    },
    { signal },
  );
  root.addEventListener(
    'focusout',
    (event) => {
      if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget))
        hold(false);
    },
    { signal },
  );
  document.addEventListener('visibilitychange', schedule, { signal });

  controls.hidden = false;
  show(current);
  setPaused(paused);

  return () => {
    controller.abort();
    window.clearTimeout(timer);
  };
}
