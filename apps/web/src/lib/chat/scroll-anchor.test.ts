// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { SCROLL_ANCHOR_STORAGE_KEY, pickAnchor, saveAnchor, takeAnchor } from './scroll-anchor';

/** An in-memory Storage with only the methods scroll-anchor.ts uses. */
function memoryStorage() {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
  return { items, storage: () => storage };
}

const box = (id: string, top: number, bottom: number) => ({ id, top, bottom });

describe('pickAnchor', () => {
  it('anchors the first turn that still shows at the top of the area', () => {
    const turns = [box('a', -900, -100), box('b', -60, 400), box('c', 420, 900)];
    expect(pickAnchor(turns, 0)).toEqual({ turnId: 'b', offset: -60 });
  });

  it('measures from the top of the area, not of the window', () => {
    // The panel's scroll area starts 200 px down the window (from md).
    expect(pickAnchor([box('a', 260, 700)], 200)).toEqual({ turnId: 'a', offset: 60 });
  });

  it('has no anchor when every turn is above the area', () => {
    expect(pickAnchor([box('a', -900, -100)], 0)).toBeNull();
    expect(pickAnchor([], 0)).toBeNull();
  });
});

describe('saveAnchor / takeAnchor', () => {
  it('round-trips an anchor once: reading it removes it', () => {
    const { storage } = memoryStorage();
    saveAnchor({ turnId: 'turn-1', offset: -42.5 }, storage);
    expect(takeAnchor(storage)).toEqual({ turnId: 'turn-1', offset: -42.5 });
    expect(takeAnchor(storage)).toBeNull();
  });

  it('null forgets a stored anchor (the reader left at the end)', () => {
    const { items, storage } = memoryStorage();
    saveAnchor({ turnId: 'turn-1', offset: 0 }, storage);
    saveAnchor(null, storage);
    expect(items.has(SCROLL_ANCHOR_STORAGE_KEY)).toBe(false);
  });

  it.each([
    ['not JSON', '{'],
    ['an array', '[]'],
    ['no turn id', '{"offset":0}'],
    ['an empty turn id', '{"turnId":"","offset":0}'],
    ['a turn id too long to be ours', JSON.stringify({ turnId: 'x'.repeat(65), offset: 0 })],
    ['a non-numeric offset', '{"turnId":"a","offset":"10"}'],
    ['an infinite offset', '{"turnId":"a","offset":1e999}'],
  ])('reads %s as no anchor', (_label, stored) => {
    const { items, storage } = memoryStorage();
    items.set(SCROLL_ANCHOR_STORAGE_KEY, stored);
    expect(takeAnchor(storage)).toBeNull();
  });

  it('missing or failing storage never throws', () => {
    const failing = () => {
      throw new Error('blocked');
    };
    expect(() => {
      saveAnchor({ turnId: 'a', offset: 0 }, failing);
    }).not.toThrow();
    expect(takeAnchor(failing)).toBeNull();
  });
});
