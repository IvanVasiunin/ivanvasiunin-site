import { describe, expect, it } from 'vitest';
import { createRandom, createStars } from './stars';

describe('createRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('gives different sequences for different seeds', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it('stays in [0, 1)', () => {
    const random = createRandom(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('createStars', () => {
  const options = { count: 60, size: 320, seed: 7 };

  it('creates the requested number of stars', () => {
    expect(createStars(options)).toHaveLength(60);
  });

  it('is deterministic, so builds do not change the sky', () => {
    expect(createStars(options)).toEqual(createStars(options));
  });

  it('keeps every whole star inside the tile with a bounded radius and opacity', () => {
    for (const star of createStars(options)) {
      expect(star.x - star.radius).toBeGreaterThanOrEqual(0);
      expect(star.x + star.radius).toBeLessThanOrEqual(320);
      expect(star.y - star.radius).toBeGreaterThanOrEqual(0);
      expect(star.y + star.radius).toBeLessThanOrEqual(320);
      expect(star.radius).toBeGreaterThanOrEqual(0.4);
      expect(star.radius).toBeLessThanOrEqual(1.3);
      expect(star.opacity).toBeGreaterThanOrEqual(0.25);
      expect(star.opacity).toBeLessThanOrEqual(0.85);
    }
  });

  it('makes small stars more common than large ones', () => {
    const stars = createStars({ ...options, count: 400 });
    const small = stars.filter((star) => star.radius < 0.85).length;
    expect(small).toBeGreaterThan(stars.length / 2);
  });
});
