// Runtime detection of a device too slow for the knowledge map's motion (SPEC §6.3, ROADMAP 6.4).
// The static signals (cores, memory, data saver) miss a fast-looking machine that is busy or
// throttled; the frames themselves tell. While the map animates, every gap between two frames is
// measured. When more than a quarter of an animation's frames were long, the motion stuttered all
// the way through, and the map switches to light mode (final states at once) for the rest of the
// visit: every later answer shows its final state at once.
//
// A share, not a count (measured 2026-11-07 at 4× / 6× CPU): when an answer arrives, the chat's
// own rendering makes a burst of long frames (10–18, some of 0.5–1 s) at the start of the
// ignition, and the map runs smoothly after it. A count of long frames switched a capable device
// off for good over that one-off burst; a share of a whole animation does not. The animation is
// judged when it ends, not part-way: a slow device draws few frames, so an early verdict would
// rest on the burst alone. And by its length in time, not in frames: a slow device draws a whole
// ignition in 10–15 frames (6× CPU, headless), so a frame minimum let exactly the slowest pass.
//
// Pure: the renderer feeds it frame times; no DOM, no timers.

/** A frame slower than this (ms) is long: under 20 fps the motion stutters visibly. */
export const LONG_FRAME_MS = 50;
/** More than this share of an animation's frames long: the device is too slow for the motion. */
export const SLOW_SHARE = 0.25;
/** Judged only an animation at least this long (ms): a hover ring (260 ms) is too short. */
export const MIN_ANIMATION_MS = 1000;
/**
 * A gap longer than this (ms) is idle time, not a long frame: a hidden tab gets no frames, and
 * the first one after it comes back must not count (nor lengthen the animation).
 */
export const IDLE_GAP_MS = 1000;

export class LongFrameWatch {
  private first: number | null = null;
  private last: number | null = null;
  private frames = 0;
  private long = 0;
  private isSlow = false;

  /** The device proved too slow: stays true for the rest of the visit. */
  get slow(): boolean {
    return this.isSlow;
  }

  /** A frame of an animation, drawn at `now` (ms). */
  frame(now: number): void {
    if (this.last !== null && this.first !== null) {
      const gap = now - this.last;
      if (gap > IDLE_GAP_MS) {
        // Idle (a hidden tab): left out of the count and of the animation's length.
        this.first += gap;
      } else {
        this.frames += 1;
        if (gap > LONG_FRAME_MS) this.long += 1;
      }
    }
    this.first ??= now;
    this.last = now;
  }

  /**
   * The animation stopped: it is judged as a whole, the next gap is idle time (not a long frame)
   * and the next animation starts its own count.
   */
  pause(): void {
    const length = this.first !== null && this.last !== null ? this.last - this.first : 0;
    if (length >= MIN_ANIMATION_MS && this.frames > 0 && this.long / this.frames > SLOW_SHARE) {
      this.isSlow = true;
    }
    this.first = null;
    this.last = null;
    this.frames = 0;
    this.long = 0;
  }
}
