// The Sources list shows its first rows only (Ivan, 2026-11-08: a vacancy brings up to 20 sources,
// which filled the screen); the rest wait behind "Show N more". How many chips fit in a row depends
// on the width and the titles, so the cut is measured, not counted.

/** How many rows of sources show before "Show N more". */
export const SOURCE_ROWS = 2;

/**
 * The index of the first item past the first `rows` rows, or `null` when everything fits.
 *
 * `tops` are the items' top offsets in their list, in order: items of one row share a top, and a
 * new row starts lower.
 */
export function firstHiddenIndex(
  tops: readonly number[],
  rows: number = SOURCE_ROWS,
): number | null {
  const rowTops = [...new Set(tops)].sort((a, b) => a - b);
  const limit = rowTops[rows];
  if (limit === undefined) return null;
  const index = tops.findIndex((top) => top >= limit);
  return index === -1 ? null : index;
}
