import { afterEach, describe, expect, it, vi } from 'vitest';

import { emitMapEvent, onMapEvent } from './events';
import { type Box, bestAngle, placeStars } from './layout';
import { HOME, MAX_ZOOM, between, easeInOut, frame, intensity, smoothstep } from './motion';
import { type MapPoint, parseMapData } from './points';
import { aliasPattern, topicsOf } from './topics';

const point = (
  id: string,
  x: number,
  y: number,
  sourceType: MapPoint['sourceType'] = 'cv',
  concepts: string[] = [],
): MapPoint => ({
  id,
  x,
  y,
  sourceType,
  section: id,
  title: `CV — ${id}`,
  concepts,
});

const RAW = {
  version: '2026-11-07T12:00:00Z',
  points: [
    {
      id: 'cv:brainrocket:0',
      x: 0.4,
      y: 0.6,
      source_type: 'cv',
      section: 'BrainRocket',
      title: 'CV — BrainRocket',
      c: ['brainrocket', 'angular'],
    },
    {
      id: 'personal:pet:0',
      x: 0.9,
      y: 0.1,
      source_type: 'personal',
      section: 'Pet',
      title: 'Personal facts — Pet',
      c: ['monty'],
    },
  ],
  concepts: [
    { id: 'brainrocket', label: 'BrainRocket', aliases: ['brainrocket'] },
    { id: 'angular', label: 'Angular', aliases: ['angular'] },
    { id: 'monty', label: 'Monty the corgi', aliases: ['monty', 'corgi', 'dog'] },
  ],
};

describe('parseMapData', () => {
  it('reads points.json v2 into camel-cased points', () => {
    const data = parseMapData(RAW);

    expect(data?.points[0]).toEqual({
      id: 'cv:brainrocket:0',
      x: 0.4,
      y: 0.6,
      sourceType: 'cv',
      section: 'BrainRocket',
      title: 'CV — BrainRocket',
      concepts: ['brainrocket', 'angular'],
    });
    expect(data?.concepts).toHaveLength(3);
  });

  it.each([
    ['not an object', 'nope'],
    ['a point outside 0..1', { ...RAW, points: [{ ...RAW.points[0], x: 1.5 }] }],
    ['an unknown source type', { ...RAW, points: [{ ...RAW.points[0], source_type: 'evil' }] }],
    ['concept ids that are not strings', { ...RAW, points: [{ ...RAW.points[0], c: [1] }] }],
    ['a repeated id', { ...RAW, points: [RAW.points[0], RAW.points[0]] }],
    ['a concept without aliases', { ...RAW, concepts: [{ id: 'x', label: 'X', aliases: [] }] }],
    ['no concepts list (v1)', { version: RAW.version, points: RAW.points }],
  ])('hides the map for %s', (_case, raw) => {
    expect(parseMapData(raw)).toBeNull();
  });
});

describe('layout', () => {
  // A long thin cloud along the x axis: in a tall box it is turned upright.
  const strip = Array.from({ length: 20 }, (_, i) =>
    point(`cv:s:${String(i)}`, i / 20, 0.5 + (i % 2) * 0.01),
  );
  const tall: Box = { width: 400, height: 600 };

  it('turns a wide map upright to fill a tall card', () => {
    const degrees = bestAngle(strip, tall);

    expect(degrees % 180).toBeGreaterThan(45);
    expect(degrees % 180).toBeLessThan(135);
  });

  it('keeps every star inside the box, one scale for both axes', () => {
    const { positions } = placeStars(strip, tall);

    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(tall.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(tall.height);
    }
  });

  it("puts Ivan's material above the site docs", () => {
    const mixed = [
      ...Array.from({ length: 5 }, (_, i) =>
        point(`site_docs:a:${String(i)}`, 0.1 + i * 0.01, 0.1, 'site_docs'),
      ),
      ...Array.from({ length: 5 }, (_, i) => point(`cv:a:${String(i)}`, 0.1 + i * 0.01, 0.9, 'cv')),
    ];
    const { positions } = placeStars(mixed, tall);
    const mean = (from: number, to: number) =>
      positions.slice(from, to).reduce((s, p) => s + p.y, 0) / (to - from);

    expect(mean(5, 10)).toBeLessThan(mean(0, 5));
  });

  it('keeps the stars out of the insets (the Topics line and the legend)', () => {
    const { positions } = placeStars(strip, tall, undefined, { top: 30, bottom: 50 });

    for (const p of positions) {
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThanOrEqual(tall.height - 50);
    }
  });

  it('keeps the orientation it is given (a resize never re-picks the angle)', () => {
    const first = placeStars(strip, tall);
    const resized = placeStars(strip, { width: 380, height: 560 }, first.orientation);

    expect(resized.orientation).toEqual(first.orientation);
  });
});

describe('motion', () => {
  it('eases from 0 to 1, flat at both ends and clamped outside', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(2)).toBe(1);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
  });

  it('maps relevance to brightness between 0.55 and 1', () => {
    expect(intensity(0)).toBeCloseTo(0.55);
    expect(intensity(1)).toBe(1);
    expect(intensity(7)).toBe(1);
    expect(intensity(0.5)).toBeCloseTo(0.775);
  });

  it('frames the lit stars without leaving the map, and goes home without stars', () => {
    const box: Box = { width: 400, height: 600 };
    const camera = frame(
      [
        { x: 380, y: 580 },
        { x: 390, y: 590 },
      ],
      box,
    );

    expect(camera.z).toBeLessThanOrEqual(MAX_ZOOM);
    expect(camera.z).toBeGreaterThan(1);
    // The bottom-right corner of the map stays in view, nothing beyond it.
    expect(camera.x).toBeGreaterThanOrEqual(box.width - box.width * camera.z);
    expect(camera.y).toBeGreaterThanOrEqual(box.height - box.height * camera.z);
    expect(frame([], box)).toEqual(HOME);
  });

  it('moves the camera along a straight line', () => {
    expect(between(HOME, { x: -100, y: -50, z: 2 }, 0.5)).toEqual({ x: -50, y: -25, z: 1.5 });
  });
});

describe('topics', () => {
  const data = parseMapData(RAW);
  const points = new Map(data?.points.map((p) => [p.id, p]));
  const concepts = data?.concepts ?? [];

  it('names the concepts the answer mentions that a read passage mentions too, in answer order', () => {
    const answer = 'He builds Angular UI at BrainRocket. Angular again.';

    expect(topicsOf(answer, ['cv:brainrocket:0'], points, concepts)).toEqual([
      'Angular',
      'BrainRocket',
    ]);
  });

  it('leaves out concepts no read passage mentions', () => {
    expect(topicsOf('Monty is a corgi', ['cv:brainrocket:0'], points, concepts)).toEqual([]);
  });

  it('matches whole words in any case, Cyrillic included', () => {
    expect(aliasPattern(['angular']).test('ANGULAR!')).toBe(true);
    expect(aliasPattern(['dog']).test('dogma')).toBe(false);
    expect(aliasPattern(['ментор']).test('мой ментор.')).toBe(true);
    expect(aliasPattern(['ментор']).test('менторство')).toBe(false);
  });
});

describe('events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers a typed detail and stops after unsubscribe', () => {
    const seen = vi.fn();
    const stop = onMapEvent('knowledge-map:point-star', seen);

    emitMapEvent('knowledge-map:point-star', { id: 'cv:a:0' });
    stop();
    emitMapEvent('knowledge-map:point-star', { id: null });

    expect(seen).toHaveBeenCalledExactlyOnceWith({ id: 'cv:a:0' });
  });
});
