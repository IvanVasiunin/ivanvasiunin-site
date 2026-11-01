import { describe, expect, it } from 'vitest';
import { compositeOver, contrastRatio, parseRgb, parseRgba, relativeLuminance } from './contrast';

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

describe('parseRgb', () => {
  it('parses legacy comma syntax', () => {
    expect(parseRgb('rgb(30, 43, 47)')).toEqual({ r: 30, g: 43, b: 47 });
  });

  it('parses modern space syntax with alpha', () => {
    expect(parseRgb('rgb(30 43 47 / 0.5)')).toEqual({ r: 30, g: 43, b: 47 });
  });

  it('keeps fractional channels and drops alpha', () => {
    expect(parseRgb('rgba(30.5, 43, 47, 0.25)')).toEqual({ r: 30.5, g: 43, b: 47 });
  });

  it('parses color(srgb) from color-mix() with 0–1 channels', () => {
    expect(parseRgb('color(srgb 1 0.5 0)')).toEqual({ r: 255, g: 127.5, b: 0 });
  });

  it('rejects other formats', () => {
    expect(() => parseRgb('#1e2b2f')).toThrow('Not an rgb() or color(srgb) colour');
    expect(() => parseRgb('oklch(0.5 0.1 200)')).toThrow('Not an rgb() or color(srgb) colour');
  });
});

describe('parseRgba', () => {
  it('defaults alpha to 1', () => {
    expect(parseRgba('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
  });

  it('reads legacy rgba() alpha', () => {
    expect(parseRgba('rgba(1, 2, 3, 0.07)').a).toBe(0.07);
  });

  it('reads color(srgb) alpha', () => {
    expect(parseRgba('color(srgb 0.1 0.2 0.3 / 0.4)').a).toBe(0.4);
  });

  it('reads modern slash alpha as a number or a percentage', () => {
    expect(parseRgba('rgb(1 2 3 / 0.5)').a).toBe(0.5);
    expect(parseRgba('rgb(1 2 3 / 12%)').a).toBeCloseTo(0.12, 10);
  });
});

describe('compositeOver', () => {
  it('returns the bottom colour for a fully transparent top', () => {
    expect(compositeOver({ r: 255, g: 0, b: 0, a: 0 }, { r: 10, g: 20, b: 30 })).toEqual({
      r: 10,
      g: 20,
      b: 30,
    });
  });

  it('returns the top colour for an opaque top', () => {
    expect(compositeOver({ r: 255, g: 0, b: 0, a: 1 }, WHITE)).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('mixes linearly in between', () => {
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE)).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
    });
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBe(1);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white, in either order', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
  });

  it('is 1 for the same colour', () => {
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
  });

  it('matches a known WCAG value: #767676 on white is 4.54', () => {
    expect(contrastRatio({ r: 118, g: 118, b: 118 }, WHITE)).toBeCloseTo(4.54, 2);
  });
});
