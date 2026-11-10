// The CV timeline drawn on scroll where scroll-driven animations do not exist (Safari before 26; Ivan,
// 2026-11-10: on iOS 18 the meridian was always fully drawn and static). CvJob.scss draws it with a
// view timeline where the browser has one; here a scroll listener writes each job's progress into two
// custom properties that the same transforms read. Without JS, with reduced motion and in print the
// line stays fully drawn, as before.

/** The reading line, as a share of the viewport height. Keep in step with `--timeline-draw-line`. */
export const DRAW_LINE = 0.65;

/** How far past a job's top the reading line travels while its star lights up (px, `--space-xl`). */
export const STAR_RANGE_PX = 32;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/**
 * How much of a job's line is drawn (0..1): 0 until the reading line reaches its top, 1 once it has
 * passed its bottom. Matches `view(block 65% 35%)` with `cover 0% cover 100%`.
 */
export function drawProgress(top: number, height: number, viewportHeight: number): number {
  if (height <= 0) return 1;
  return clamp01((viewportHeight * DRAW_LINE - top) / height);
}

/** How lit a job's star is (0..1): over the first `STAR_RANGE_PX` past the reading line. */
export function starProgress(top: number, viewportHeight: number): number {
  return clamp01((viewportHeight * DRAW_LINE - top) / STAR_RANGE_PX);
}

type TimelineWindow = Pick<
  Window,
  'innerHeight' | 'addEventListener' | 'requestAnimationFrame' | 'matchMedia'
> & { readonly CSS?: Pick<typeof CSS, 'supports'> };

/** Starts the fallback for the given jobs, or does nothing where CSS does the job. */
export function initTimelineFallback(jobs: readonly HTMLElement[], win: TimelineWindow): void {
  if (jobs.length === 0) return;
  if (win.CSS?.supports('animation-timeline: view()') === true) return;
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let queued = false;
  const update = (): void => {
    queued = false;
    const viewportHeight = win.innerHeight;
    // Read every box first, then write: no layout thrashing.
    const boxes = jobs.map((job) => job.getBoundingClientRect());
    jobs.forEach((job, index) => {
      const box = boxes[index];
      if (box === undefined) return;
      job.style.setProperty(
        '--cv-job-draw',
        drawProgress(box.top, box.height, viewportHeight).toFixed(3),
      );
      job.style.setProperty('--cv-job-star', starProgress(box.top, viewportHeight).toFixed(3));
    });
  };
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(update);
  };

  update();
  for (const job of jobs) job.toggleAttribute('data-timeline-fallback', true);
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule, { passive: true });
}
