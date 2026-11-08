import { describe, expect, it } from 'vitest';

import { SOURCE_ROWS, firstHiddenIndex } from './sourceRows';

describe('firstHiddenIndex', () => {
  it('keeps everything when the items fit in the rows', () => {
    expect(firstHiddenIndex([0, 0, 52, 52], 2)).toBeNull();
    expect(firstHiddenIndex([], 2)).toBeNull();
  });

  it('hides from the first item of the row past the limit', () => {
    // Three per row: rows at 0, 52, 104.
    expect(firstHiddenIndex([0, 0, 0, 52, 52, 52, 104, 104], 2)).toBe(6);
  });

  it('counts a tall (wrapped) chip as one row', () => {
    // A two-line chip makes its row taller; the next row simply starts lower.
    expect(firstHiddenIndex([0, 0, 52, 122, 122], 2)).toBe(3);
  });

  it('shows two rows by default', () => {
    expect(SOURCE_ROWS).toBe(2);
    expect(firstHiddenIndex([0, 52, 104])).toBe(2);
  });
});
