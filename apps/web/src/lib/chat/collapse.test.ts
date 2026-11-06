import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SCROLL_END_FALLBACK_MS,
  clampDistance,
  scrollBeforeCollapse,
  scrollContainer,
  takenHeight,
} from './collapse';

describe('clampDistance', () => {
  it.each([
    // scrollTop, scrollHeight, clientHeight, removed height → how far to scroll up first
    [700, 1000, 300, 400, 400], // at the end: the whole panel's height would be clamped away
    [500, 1000, 300, 400, 200], // partly: only what reaches past the new end
    [100, 1000, 300, 400, 0], // far from the end: nothing moves
    [0, 600, 300, 400, 0], // the content becomes shorter than the view: the top stays the top
  ])(
    'top %d of %d (view %d), removing %d: %d',
    (scrollTop, scrollHeight, clientHeight, height, distance) => {
      expect(clampDistance({ scrollTop, scrollHeight, clientHeight }, height)).toBe(distance);
    },
  );
});

/** A scrolling box at its end with a panel inside (jsdom does no layout: sizes are set by hand). */
function scrollingBoxWithPanel(): {
  box: HTMLElement;
  panel: HTMLElement;
  scrollBy: ReturnType<typeof vi.fn>;
} {
  const box = document.createElement('div');
  box.style.overflowY = 'auto';
  const panel = document.createElement('div');
  box.append(panel);
  document.body.append(box);
  Object.defineProperties(box, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 300 },
    scrollTop: { value: 700, writable: true },
  });
  Object.defineProperty(panel, 'offsetHeight', { value: 400 });
  const scrollBy = vi.fn();
  box.scrollBy = scrollBy;
  return { box, panel, scrollBy };
}

describe('takenHeight', () => {
  it('counts the gap before the element in a flex column: it goes with the element', () => {
    const column = document.createElement('div');
    column.style.display = 'flex';
    column.style.rowGap = '12px';
    const panel = document.createElement('div');
    column.append(panel);
    document.body.append(column);
    Object.defineProperty(panel, 'offsetHeight', { value: 400 });

    expect(takenHeight(panel)).toBe(412);
    column.remove();
  });
});

describe('scrollBeforeCollapse', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('finds the scrolling box around the panel', () => {
    const { box, panel } = scrollingBoxWithPanel();

    expect(scrollContainer(panel)).toBe(box);
  });

  it('scrolls up by the clamp distance, then reports done on scrollend', () => {
    const { box, panel, scrollBy } = scrollingBoxWithPanel();
    const done = vi.fn();

    scrollBeforeCollapse(panel, done);

    expect(scrollBy).toHaveBeenCalledWith({ top: -400, behavior: 'smooth' });
    expect(done).not.toHaveBeenCalled();
    box.dispatchEvent(new Event('scrollend'));
    expect(done).toHaveBeenCalledOnce();
  });

  it('does not wait forever where the browser has no scrollend', () => {
    vi.useFakeTimers();
    const { panel } = scrollingBoxWithPanel();
    const done = vi.fn();

    scrollBeforeCollapse(panel, done);
    vi.advanceTimersByTime(SCROLL_END_FALLBACK_MS);

    expect(done).toHaveBeenCalledOnce();
  });

  it('is done at once when nothing would jump', () => {
    const panel = document.createElement('div');
    document.body.append(panel);
    const done = vi.fn();

    scrollBeforeCollapse(panel, done);

    expect(done).toHaveBeenCalledOnce();
  });

  it('cancelled (the panel reopened), it never reports done', () => {
    const { box, panel } = scrollingBoxWithPanel();
    const done = vi.fn();

    const cancel = scrollBeforeCollapse(panel, done);
    cancel();
    box.dispatchEvent(new Event('scrollend'));

    expect(done).not.toHaveBeenCalled();
  });
});
