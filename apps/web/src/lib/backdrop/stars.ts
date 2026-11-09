/** One star of the backdrop star field, in tile coordinates. */
export interface Star {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
}

export interface StarFieldOptions {
  /** Number of stars in one tile. */
  readonly count: number;
  /** Tile edge in SVG user units; the tile repeats across the viewport. */
  readonly size: number;
  /** Same seed, same sky: the field is generated at build time and must not change between builds. */
  readonly seed: number;
}

const MIN_RADIUS = 0.4;
const MAX_RADIUS = 1.3;
const MIN_OPACITY = 0.25;
const MAX_OPACITY = 0.85;

/** Mulberry32: a tiny deterministic PRNG returning numbers in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Generates a repeatable star field. Small stars dominate: the radius is skewed towards the minimum,
 * and brighter stars are rarer, like a real sky.
 */
export function createStars({ count, size, seed }: StarFieldOptions): readonly Star[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => {
    const magnitude = random() ** 3;
    return {
      // Kept a full radius away from the tile edges: a star on the seam would be cut in half.
      x: round(MAX_RADIUS + random() * (size - 2 * MAX_RADIUS)),
      y: round(MAX_RADIUS + random() * (size - 2 * MAX_RADIUS)),
      radius: round(MIN_RADIUS + magnitude * (MAX_RADIUS - MIN_RADIUS)),
      opacity: round(MIN_OPACITY + magnitude * (MAX_OPACITY - MIN_OPACITY)),
    };
  });
}
