// Where the reader was in the conversation when they left the page (Ivan, 2026-11-05): a link in an
// answer opens the CV; coming back to AI mode must show that answer again, not the end of the chat.
// Kept next to the conversation (history.ts) in sessionStorage, for the tab's lifetime.
//
// The anchor is a turn and the distance of its top edge from the top of the visible area, not a
// scroll offset: the restored page may lay out a little differently (fonts, a rotated phone), and a
// turn's own position survives that better than a pixel count from the top of the page.
//
// Stored data is untrusted input (typescript.md): anything malformed reads as "no anchor".

export const SCROLL_ANCHOR_STORAGE_KEY = 'elio-chat-scroll-v1';

/** Turn ids are UUIDs (useChat.ts); anything longer is not one this page stored. */
const MAX_TURN_ID_CHARS = 64;

export interface ScrollAnchor {
  /** The turn at the top of the visible area. */
  readonly turnId: string;
  /** Its top edge, from the top of the visible area (px; negative once it starts above it). */
  readonly offset: number;
}

export interface TurnBox {
  readonly id: string;
  readonly top: number;
  readonly bottom: number;
}

/**
 * The anchor for a reader looking at the area from `viewTop` down: the first turn that still shows
 * there (its bottom edge below `viewTop`), or null when no turn does.
 */
export function pickAnchor(turns: readonly TurnBox[], viewTop: number): ScrollAnchor | null {
  const turn = turns.find((box) => box.bottom > viewTop);
  return turn === undefined ? null : { turnId: turn.id, offset: turn.top - viewTop };
}

type AnchorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const browserStorage = (): AnchorStorage => window.sessionStorage;

/** Saves the anchor, or forgets it with null (the reader was at the end: follow it again). */
export function saveAnchor(anchor: ScrollAnchor | null, storage = browserStorage): void {
  try {
    if (anchor === null) {
      storage().removeItem(SCROLL_ANCHOR_STORAGE_KEY);
      return;
    }
    storage().setItem(SCROLL_ANCHOR_STORAGE_KEY, JSON.stringify(anchor));
  } catch {
    // Storage unavailable or full: the chat comes back at its end, as without an anchor.
  }
}

/** The stored anchor once (it is removed on reading), or null when there is no valid one. */
export function takeAnchor(storage = browserStorage): ScrollAnchor | null {
  let raw: unknown;
  try {
    const text = storage().getItem(SCROLL_ANCHOR_STORAGE_KEY);
    storage().removeItem(SCROLL_ANCHOR_STORAGE_KEY);
    if (text === null) return null;
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { turnId, offset } = raw as Record<string, unknown>;
  if (
    typeof turnId !== 'string' ||
    turnId.length === 0 ||
    turnId.length > MAX_TURN_ID_CHARS ||
    typeof offset !== 'number' ||
    !Number.isFinite(offset)
  ) {
    return null;
  }
  return { turnId, offset };
}
