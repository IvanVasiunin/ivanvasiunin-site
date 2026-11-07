// Where each star goes in the card (ADR-0012). The projection's axes carry no meaning, so the map
// is turned to fill the card best, with one scale for both axes (no stretching), and Ivan's own
// material on top. The angle is chosen once and kept: a later resize only rescales (Ivan,
// 2026-11-07: re-picking the angle mid-animation made the map jump).
import type { MapPoint } from './points';

export interface Box {
  readonly width: number;
  readonly height: number;
}

export interface Placed {
  readonly x: number;
  readonly y: number;
}

/** The turn chosen for a map: an angle in degrees, and whether it is flipped by 180°. */
export interface Orientation {
  readonly degrees: number;
  readonly flipped: boolean;
}

/** Bands of the box kept free of stars (px). */
export interface Insets {
  readonly top: number;
  readonly bottom: number;
}

const NO_INSETS: Insets = { top: 0, bottom: 0 };

export const ANGLE_STEP_DEGREES = 3;
export const PADDING_PX = 34;

interface Fit {
  readonly degrees: number;
  readonly scale: number;
  readonly rotated: readonly Placed[];
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

function rotate(points: readonly MapPoint[], degrees: number): Placed[] {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return points.map((p) => ({
    x: (p.x - cx) * cos - (p.y - cy) * sin,
    y: (p.x - cx) * sin + (p.y - cy) * cos,
  }));
}

function fitAt(points: readonly MapPoint[], degrees: number, box: Box): Fit {
  const rotated = rotate(points, degrees);
  const xs = rotated.map((q) => q.x);
  const ys = rotated.map((q) => q.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(Math.max(...xs) - minX, 1e-9);
  const height = Math.max(Math.max(...ys) - minY, 1e-9);
  const scale = Math.min(
    (box.width - 2 * PADDING_PX) / width,
    (box.height - 2 * PADDING_PX) / height,
  );
  return { degrees, scale, rotated, minX, minY, width, height };
}

/** The angle (in ANGLE_STEP_DEGREES steps) at which the map fills the box at the largest scale. */
export function bestAngle(points: readonly MapPoint[], box: Box): number {
  let best = fitAt(points, 0, box);
  for (let degrees = ANGLE_STEP_DEGREES; degrees < 180; degrees += ANGLE_STEP_DEGREES) {
    const fit = fitAt(points, degrees, box);
    if (fit.scale > best.scale) best = fit;
  }
  return best.degrees;
}

const isIvans = (p: MapPoint): boolean => p.sourceType !== 'site_docs';

/**
 * The stars' positions in the box. Without an orientation the best one is chosen (Ivan's material
 * on top); pass the returned orientation back on resize to keep it.
 */
export function placeStars(
  points: readonly MapPoint[],
  box: Box,
  orientation?: Orientation,
  insets: Insets = NO_INSETS,
): { readonly positions: Placed[]; readonly orientation: Orientation } {
  if (points.length === 0)
    return { positions: [], orientation: orientation ?? { degrees: 0, flipped: false } };
  // The stars fit between the insets (room for the Topics line on top and the legend below).
  const area: Box = {
    width: box.width,
    height: Math.max(1, box.height - insets.top - insets.bottom),
  };
  const fit = fitAt(points, orientation?.degrees ?? bestAngle(points, area), area);
  const offsetX = (box.width - fit.width * fit.scale) / 2;
  const offsetY = insets.top + (area.height - fit.height * fit.scale) / 2;
  let positions = fit.rotated.map((q) => ({
    x: offsetX + (q.x - fit.minX) * fit.scale,
    y: offsetY + (q.y - fit.minY) * fit.scale,
  }));
  const meanY = (keep: (p: MapPoint) => boolean): number => {
    const ys = positions
      .filter((_, i) => {
        const point = points[i];
        return point !== undefined && keep(point);
      })
      .map((q) => q.y);
    return ys.length === 0 ? 0 : ys.reduce((sum, y) => sum + y, 0) / ys.length;
  };
  const flipped = orientation?.flipped ?? meanY(isIvans) > meanY((p) => !isIvans(p));
  // Turned around the middle of the area between the insets, so the stars stay inside it.
  const turnY = insets.top + area.height / 2;
  if (flipped) positions = positions.map((q) => ({ x: box.width - q.x, y: 2 * turnY - q.y }));
  return { positions, orientation: { degrees: fit.degrees, flipped } };
}
