// The knowledge map's motion: timings, easing, the camera and star brightness (ADR-0012, SPEC
// US-A12). Pure functions; the renderer calls them every frame while something moves.
import type { Box, Placed } from './layout';

/** Durations (ms). Ivan, 2026-11-07: ignition over 1.5–3 s, smooth, never sudden. */
export const TIMING = {
  dim: 900,
  ignite: 2200,
  stagger: 220,
  cameraIn: 2600,
  cameraOut: 1100,
  hoverRing: 260,
} as const;

/** How dim the unread stars get while an answer is lit (both themes: the sky is always dark). */
export const DIM_WHILE_LIT = 0.15;
export const DIM_WHILE_SEARCHING = 0.5;
/** The camera never zooms in further than this. */
export const MAX_ZOOM = 2.1;
/** Room around the lit stars when the camera frames them (px). */
export const FRAME_PADDING_PX = 70;

const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);

/** 0 → 1 with zero speed at both ends. */
export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Cubic ease-in-out: the camera's curve. */
export const easeInOut = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/** How bright a read star burns: 0.55 for the weakest relevance, 1 for a perfect match. */
export const intensity = (score: number): number => 0.55 + 0.45 * clamp01(score);

/** A camera: a uniform zoom `z` and a shift, applied as `screen = world × z + (x, y)`. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const HOME: Camera = { x: 0, y: 0, z: 1 };

/** The camera between two others, `k` from 0 to 1 along the way. */
export const between = (from: Camera, to: Camera, k: number): Camera => ({
  x: from.x + (to.x - from.x) * k,
  y: from.y + (to.y - from.y) * k,
  z: from.z + (to.z - from.z) * k,
});

/**
 * The camera that frames these stars: as close as MAX_ZOOM allows with FRAME_PADDING_PX around
 * them, centred on them, never showing anything outside the map's box. No stars: the whole map.
 */
export function frame(stars: readonly Placed[], box: Box): Camera {
  if (stars.length === 0) return HOME;
  const xs = stars.map((s) => s.x);
  const ys = stars.map((s) => s.y);
  const width = Math.max(...xs) - Math.min(...xs) + 2 * FRAME_PADDING_PX;
  const height = Math.max(...ys) - Math.min(...ys) + 2 * FRAME_PADDING_PX;
  const z = Math.max(1, Math.min(MAX_ZOOM, box.width / width, box.height / height));
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const x = Math.min(0, Math.max(box.width - box.width * z, box.width / 2 - midX * z));
  const y = Math.min(0, Math.max(box.height - box.height * z, box.height / 2 - midY * z));
  return { x, y, z };
}
