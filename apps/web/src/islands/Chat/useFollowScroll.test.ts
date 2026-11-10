// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { atEnd, FOLLOW_THRESHOLD_PX, nextFollowing, SHOW_MARGIN_PX } from './useFollowScroll';

const at = (scrollY: number, distanceToBottom: number) => ({ scrollY, distanceToBottom });

describe('nextFollowing', () => {
  it('follows again once the reader is back near the bottom', () => {
    expect(nextFollowing(false, at(100, 400), at(400, FOLLOW_THRESHOLD_PX))).toBe(true);
  });

  it('pauses when the reader scrolls up, even by a little', () => {
    expect(nextFollowing(true, at(500, 100), at(490, 110))).toBe(false);
  });

  it('keeps following while the content grows below a still page', () => {
    // A token adds a line before the layout effect scrolls: the page did not move up.
    expect(nextFollowing(true, at(500, 0), at(500, 300))).toBe(true);
  });

  it('stays paused while the reader scrolls down but is not at the bottom yet', () => {
    expect(nextFollowing(false, at(100, 900), at(300, 700))).toBe(false);
  });

  it('follows when the conversation ends above the docked input (the footer still below)', () => {
    // Below md the distance is measured to the input's top edge: negative once it has come to rest.
    expect(nextFollowing(false, at(300, 120), at(380, -40))).toBe(true);
  });

  it('a smooth jump down never pauses on the way', () => {
    expect(nextFollowing(true, at(100, 900), at(400, 600))).toBe(true);
  });
});

describe('atEnd (below md)', () => {
  it('is at the end within the threshold, away from it past the margin', () => {
    expect(atEnd(false, FOLLOW_THRESHOLD_PX)).toBe(true);
    expect(atEnd(true, FOLLOW_THRESHOLD_PX + SHOW_MARGIN_PX + 1)).toBe(false);
  });

  // Ivan, 2026-11-10: on a phone "Jump to latest" blinked by Copy / Retry. Between the thresholds
  // the previous state holds, so a page bouncing at the edge never toggles it.
  it('keeps the previous state between the thresholds', () => {
    const between = FOLLOW_THRESHOLD_PX + SHOW_MARGIN_PX / 2;
    expect(atEnd(true, between)).toBe(true);
    expect(atEnd(false, between)).toBe(false);
  });
});
