// The knowledge map's canvas renderer (ADR-0012). It draws the stars, runs the frame loop only
// while something moves (dimming, ignition, camera, hover ring) and stops at rest. It never writes
// DOM attributes or styles: the island owns the markup (tooltip, caption) and asks for positions.
//
// The look ("night window", Ivan, 2026-11-07): a dark sky in both themes; each star is drawn from
// pre-rendered sprites of its source's colour. Halos add light (`'lighter'`), so overlapping glows
// brighten like stars; a read star's core is a "neon" sprite, near-white in the centre and the
// source colour at the edge, painted normally so it never burns to plain white.
import { LongFrameWatch } from '../../lib/viz/frames';
import { type Box, type Orientation, type Placed, placeStars } from '../../lib/viz/layout';
import {
  type Camera,
  DIM_WHILE_LIT,
  DIM_WHILE_SEARCHING,
  HOME,
  TIMING,
  between,
  easeInOut,
  frame,
  intensity,
  smoothstep,
} from '../../lib/viz/motion';
import type { MapPoint, SourceType } from '../../lib/viz/points';

export type Rgb = readonly [number, number, number];

/** Colours read from the map's tokens (`--color-map-*`). */
export interface MapPalette {
  readonly sources: Readonly<Record<SourceType, Rgb>>;
  readonly label: string;
  readonly dust: string;
  /** The page's font family, for the region names drawn on the canvas. */
  readonly font: string;
}

export interface RendererOptions {
  /** True: final states at once (reduced motion, light mode for weak devices). */
  readonly instant: () => boolean;
  /** Region labels on the sky, in the order of `regionOf`. */
  readonly regionLabels: Readonly<Record<'career' | 'personal' | 'site', string>>;
  /** Bands kept free of stars: the Topics line on top, the legend below (px). */
  readonly insets?: { readonly top: number; readonly bottom: number };
  /** Called once when the frames show the device is too slow: light mode from now on. */
  readonly onSlow?: () => void;
}

interface Sprites {
  readonly core: HTMLCanvasElement;
  readonly glow: HTMLCanvasElement;
  readonly neon: HTMLCanvasElement;
}

interface Star {
  readonly point: MapPoint;
  x: number;
  y: number;
  /** Resting brightness: Ivan's material brighter than the site docs (area is not amount). */
  readonly base: number;
  readonly size: number;
  lit: { readonly start: number; readonly brightness: number } | null;
  dimFrom: number;
  dimTo: number;
  dimStart: number | null;
}

interface Tween<T> {
  from: T;
  to: T;
  start: number;
  duration: number;
}

const SPRITE_PX = 128;
const MAX_DPR = 2;
const DUST_COUNT = 90;
const HOVER_RADIUS_PX = 12;
/** Far enough in the past for every animation to have ended. */
const LONG_AGO_MS = 100_000;

const regionOf = (point: MapPoint): 'career' | 'personal' | 'site' =>
  point.sourceType === 'site_docs'
    ? 'site'
    : point.sourceType === 'personal'
      ? 'personal'
      : 'career';

function sprite(rgb: Rgb, kind: keyof Sprites): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_PX;
  canvas.height = SPRITE_PX;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const half = SPRITE_PX / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  const [r, g, b] = rgb;
  const mix = (k: number): string => rgb.map((v) => Math.round(v + (255 - v) * k)).join(',');
  if (kind === 'neon') {
    gradient.addColorStop(0, `rgba(${mix(0.92)},1)`);
    gradient.addColorStop(0.18, `rgba(${mix(0.7)},1)`);
    gradient.addColorStop(0.42, `rgba(${mix(0.25)},.95)`);
    gradient.addColorStop(0.7, `rgba(${String(r)},${String(g)},${String(b)},.45)`);
    gradient.addColorStop(1, `rgba(${String(r)},${String(g)},${String(b)},0)`);
  } else if (kind === 'core') {
    gradient.addColorStop(0, `rgba(${mix(0.22)},1)`);
    gradient.addColorStop(0.45, `rgba(${String(r)},${String(g)},${String(b)},1)`);
    gradient.addColorStop(1, `rgba(${String(r)},${String(g)},${String(b)},0)`);
  } else {
    gradient.addColorStop(0, `rgba(${String(r)},${String(g)},${String(b)},.9)`);
    gradient.addColorStop(0.25, `rgba(${String(r)},${String(g)},${String(b)},.45)`);
    gradient.addColorStop(0.6, `rgba(${String(r)},${String(g)},${String(b)},.12)`);
    gradient.addColorStop(1, `rgba(${String(r)},${String(g)},${String(b)},0)`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  return canvas;
}

export class KnowledgeMapRenderer {
  private readonly context: CanvasRenderingContext2D | null;
  private stars: Star[] = [];
  private dust: { x: number; y: number; a: number }[] = [];
  private regions: { label: string; x: number; y: number }[] = [];
  private sprites: Partial<Record<SourceType, Sprites>> = {};
  private palette: MapPalette | null = null;
  private box: Box = { width: 0, height: 0 };
  private dpr = 1;
  private orientation: Orientation | undefined;
  private camera: Tween<Camera> | null = null;
  private labels: Tween<number> = { from: 1, to: 1, start: 0, duration: 0 };
  private ring: { id: string; start: number } | null = null;
  private focused: string | null = null;
  private frameId: number | null = null;
  private readonly frames = new LongFrameWatch();
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly points: readonly MapPoint[],
    private readonly options: RendererOptions,
  ) {
    this.context = canvas.getContext('2d');
  }

  /** New colours (on mount; the map's tokens are the same in both themes). */
  setPalette(palette: MapPalette): void {
    this.palette = palette;
    this.sprites = {};
    for (const [kind, rgb] of Object.entries(palette.sources) as [SourceType, Rgb][]) {
      this.sprites[kind] = {
        core: sprite(rgb, 'core'),
        glow: sprite(rgb, 'glow'),
        neon: sprite(rgb, 'neon'),
      };
    }
    this.kick();
  }

  /** The canvas box in CSS pixels; the map keeps its orientation, only the scale changes. */
  resize(width: number, height: number, devicePixelRatio: number): void {
    if (width <= 0 || height <= 0) return;
    this.box = { width, height };
    this.dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    const placed = placeStars(this.points, this.box, this.orientation, this.options.insets);
    this.orientation = placed.orientation;
    const previous = new Map(this.stars.map((s) => [s.point.id, s]));
    this.stars = this.points.map((point, i) => {
      const old = previous.get(point.id);
      const at: Placed = placed.positions[i] ?? { x: 0, y: 0 };
      const ivans = point.sourceType !== 'site_docs';
      return {
        point,
        x: at.x,
        y: at.y,
        base: ivans ? 0.9 : 0.5,
        size: ivans ? 1 : 0.8,
        lit: old?.lit ?? null,
        dimFrom: old?.dimFrom ?? 1,
        dimTo: old?.dimTo ?? 1,
        dimStart: old?.dimStart ?? null,
      };
    });
    // Faint star dust: the sky's texture, not data; fixed, never animated.
    this.dust = Array.from({ length: DUST_COUNT }, (_, i) => ({
      x: (((i * 7919) % 1000) / 1000) * width,
      y: (((i * 104729) % 1000) / 1000) * height,
      a: 0.05 + ((i * 31) % 10) / 100,
    }));
    this.regions = this.regionAnchors();
    if (this.stars.some((s) => s.lit)) this.flyTo(this.litFrame(), TIMING.cameraIn / 3);
    this.kick();
  }

  /** A question was sent: everything dims, the camera goes home, the region names fade. */
  search(now = performance.now()): void {
    for (const star of this.stars) star.lit = null;
    this.dimAll(DIM_WHILE_SEARCHING, now);
    this.fadeLabels(0.35, now);
    this.flyTo(HOME, TIMING.cameraOut, now);
  }

  /**
   * Sources arrived: these stars ignite by rank, the rest dims, the camera frames them. `settled`
   * (a restored conversation): the final state at once, as if it had all happened long ago.
   */
  light(
    sources: readonly { readonly id: string; readonly score: number }[],
    settled = false,
  ): void {
    const now = settled ? performance.now() - LONG_AGO_MS : performance.now();
    const instant = settled || this.isInstant();
    const ranks = new Map(sources.map((s, rank) => [s.id, { rank, score: s.score }]));
    for (const star of this.stars) {
      const read = ranks.get(star.point.id);
      star.lit = read
        ? {
            start: now + (instant ? 0 : read.rank * TIMING.stagger),
            brightness: intensity(read.score),
          }
        : null;
    }
    const any = sources.length > 0;
    this.dimAll(any ? DIM_WHILE_LIT : 1, now);
    this.fadeLabels(any ? 0 : 1, now);
    this.flyTo(this.litFrame(), any ? TIMING.cameraIn : TIMING.cameraOut, now);
  }

  /** No question, or a reply that needed no search: the whole map at rest. */
  rest(now = performance.now()): void {
    for (const star of this.stars) star.lit = null;
    this.dimAll(1, now);
    this.fadeLabels(1, now);
    this.flyTo(HOME, TIMING.cameraOut, now);
  }

  /** The star under a point of the canvas (CSS px), or null. */
  starAt(x: number, y: number): string | null {
    const camera = this.cameraAt(performance.now());
    const wx = (x - camera.x) / camera.z;
    const wy = (y - camera.y) / camera.z;
    let best: Star | null = null;
    let bestDistance = HOVER_RADIUS_PX / camera.z;
    for (const star of this.stars) {
      const distance = Math.hypot(star.x - wx, star.y - wy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = star;
      }
    }
    return best?.point.id ?? null;
  }

  /** A ring around this star (hover); `focus` also dims the other read stars (a source pointed at). */
  pointAt(id: string | null, focus = false): void {
    this.ring = id ? { id, start: performance.now() } : null;
    this.focused = focus ? id : null;
    this.kick();
  }

  /** Where a star is on the canvas now (CSS px), for the island's tooltip. */
  screenOf(id: string): Placed | null {
    const star = this.stars.find((s) => s.point.id === id);
    if (!star) return null;
    const camera = this.cameraAt(performance.now());
    return { x: star.x * camera.z + camera.x, y: star.y * camera.z + camera.y };
  }

  /** Whether a frame is scheduled (tests: the loop must stop at rest). */
  get animating(): boolean {
    return this.frameId !== null;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  /** How long until the camera stops moving (ms; 0 when still). */
  settlesIn(now = performance.now()): number {
    if (!this.camera) return 0;
    return Math.max(0, this.camera.start + this.camera.duration - now);
  }

  // ---- internals ----

  private regionAnchors(): { label: string; x: number; y: number }[] {
    const quantile = (values: number[], k: number): number => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(k * (sorted.length - 1))] ?? 0;
    };
    return (['career', 'personal', 'site'] as const).flatMap((region) => {
      const stars = this.stars.filter((s) => regionOf(s.point) === region);
      if (stars.length === 0) return [];
      return [
        {
          label: this.options.regionLabels[region],
          x: quantile(
            stars.map((s) => s.x),
            0.5,
          ),
          y: Math.min(
            quantile(
              stars.map((s) => s.y),
              0.08,
            ) - 14,
            this.box.height - 8,
          ),
        },
      ];
    });
  }

  private litFrame(): Camera {
    return frame(
      this.stars.filter((s) => s.lit),
      this.box,
    );
  }

  private dimAll(to: number, now: number): void {
    for (const star of this.stars) {
      star.dimFrom = this.dimOf(star, now);
      star.dimTo = to;
      star.dimStart = now;
    }
    this.kick();
  }

  private dimOf(star: Star, now: number): number {
    if (star.dimStart === null) return star.dimTo;
    const k = this.isInstant() ? 1 : smoothstep((now - star.dimStart) / TIMING.dim);
    return star.dimFrom + (star.dimTo - star.dimFrom) * k;
  }

  private fadeLabels(to: number, now: number): void {
    this.labels = { from: this.labelAlpha(now), to, start: now, duration: 800 };
  }

  private labelAlpha(now: number): number {
    const { from, to, start, duration } = this.labels;
    const k = this.isInstant() || duration === 0 ? 1 : smoothstep((now - start) / duration);
    return from + (to - from) * k;
  }

  private flyTo(to: Camera, duration: number, now = performance.now()): void {
    this.camera = {
      from: this.cameraAt(now),
      to,
      start: now,
      duration: this.isInstant() ? 0 : duration,
    };
    this.kick();
  }

  private cameraAt(now: number): Camera {
    if (!this.camera) return HOME;
    const { from, to, start, duration } = this.camera;
    return duration === 0 ? to : between(from, to, easeInOut((now - start) / duration));
  }

  private kick(): void {
    if (this.destroyed) return;
    this.frameId ??= requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.frameId = null;
    // Long frames while animating switch the map to light mode (SPEC §6.3, lib/viz/frames.ts).
    const wasSlow = this.frames.slow;
    this.frames.frame(now);
    if (this.draw(now)) this.kick();
    else this.frames.pause();
    if (this.frames.slow && !wasSlow) this.options.onSlow?.();
  };

  /** Final states at once: reduced motion or a weak device (the island), or slow frames (here). */
  private isInstant(): boolean {
    return this.frames.slow || this.options.instant();
  }

  /** Draws one frame; returns whether anything is still moving. */
  private draw(now: number): boolean {
    const ctx = this.context;
    const palette = this.palette;
    if (!ctx || !palette || this.box.width === 0) return false;
    const instant = this.isInstant();
    const camera = this.cameraAt(now);
    let moving = !!this.camera && !instant && now - this.camera.start < this.camera.duration;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.box.width, this.box.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = palette.dust;
    for (const d of this.dust) {
      ctx.globalAlpha = d.a;
      ctx.fillRect(d.x, d.y, 1, 1);
    }

    ctx.setTransform(
      this.dpr * camera.z,
      0,
      0,
      this.dpr * camera.z,
      this.dpr * camera.x,
      this.dpr * camera.y,
    );
    // Stars grow a little less than the zoom, so a close-up stays delicate.
    const zs = 1 / Math.sqrt(camera.z);
    for (const star of this.stars) {
      const sprites = this.sprites[star.point.sourceType];
      if (!sprites) continue;
      const dim = this.dimOf(star, now);
      if (star.dimStart !== null && !instant && now - star.dimStart < TIMING.dim) moving = true;
      const alpha = star.base * dim;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.55;
      this.blit(sprites.glow, star, 7 * star.size * zs);
      ctx.globalAlpha = alpha;
      this.blit(sprites.core, star, 2.1 * star.size * zs);
      if (star.lit) {
        const t = instant ? 1 : smoothstep((now - star.lit.start) / TIMING.ignite);
        if (t < 1) moving = true;
        const b = star.lit.brightness * t;
        const focus = this.focused && this.focused !== star.point.id ? 0.45 : 1;
        ctx.globalAlpha = b * focus;
        this.blit(sprites.glow, star, (6 + 4 * star.lit.brightness) * zs);
        ctx.globalAlpha = b * focus * 0.9;
        this.blit(sprites.glow, star, (3.5 + 1.5 * star.lit.brightness) * zs);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, b * focus * 1.1);
        this.blit(sprites.neon, star, (3.6 + 1.4 * star.lit.brightness) * zs);
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    if (this.ring) {
      const star = this.stars.find((s) => s.point.id === this.ring?.id);
      const rgb = star ? palette.sources[star.point.sourceType] : null;
      if (star && rgb) {
        const t = instant ? 1 : smoothstep((now - this.ring.start) / TIMING.hoverRing);
        if (t < 1) moving = true;
        ctx.globalAlpha = 0.95 * t;
        ctx.strokeStyle = `rgb(${rgb.join(',')})`;
        ctx.lineWidth = 1.4 / camera.z;
        ctx.beginPath();
        ctx.arc(star.x, star.y, (9 + 3 * (1 - t)) * zs, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const labelAlpha = this.labelAlpha(now);
    if (!instant && now - this.labels.start < this.labels.duration) moving = true;
    if (labelAlpha > 0.01) {
      ctx.font = `600 10.5px ${palette.font}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.label;
      ctx.globalAlpha = 0.85 * labelAlpha;
      for (const region of this.regions) {
        ctx.fillText(region.label, region.x * camera.z + camera.x, region.y * camera.z + camera.y);
      }
    }
    ctx.globalAlpha = 1;
    return moving;
  }

  private blit(image: HTMLCanvasElement, star: Star, radius: number): void {
    this.context?.drawImage(image, star.x - radius, star.y - radius, radius * 2, radius * 2);
  }
}
