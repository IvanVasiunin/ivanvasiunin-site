import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElioAvatar } from './ElioAvatar';
import { FULL_LOOK_PX, LOOK_X, LOOK_Y, MAX_LOOK, VERTICAL_RATIO, lookOffset } from './lookAt';

/** Makes `matchMedia` answer the eye-follow query with `matches`. */
function mockMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches, media: query }) as MediaQueryList),
  );
}

/** Runs queued animation frames immediately. */
function runFrames(): void {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
}

const svgOf = (container: HTMLElement): SVGSVGElement => {
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('no svg');
  return svg;
};

const move = (x: number, y: number): void => {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  window.dispatchEvent(event);
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('lookOffset', () => {
  it('looks straight ahead when the pointer is on the avatar', () => {
    expect(lookOffset({ x: 10, y: 10 }, { x: 10, y: 10 })).toEqual({ x: 0, y: 0 });
  });

  it('turns fully towards a far pointer, a little more up and down than sideways', () => {
    expect(lookOffset({ x: 0, y: 0 }, { x: FULL_LOOK_PX * 3, y: 0 }).x).toBeCloseTo(MAX_LOOK);
    expect(lookOffset({ x: 0, y: 0 }, { x: 0, y: FULL_LOOK_PX * 3 }).y).toBeCloseTo(
      MAX_LOOK * VERTICAL_RATIO,
    );
    expect(lookOffset({ x: 0, y: 0 }, { x: 0, y: -FULL_LOOK_PX * 3 }).y).toBeLessThan(-MAX_LOOK);
  });

  it('turns proportionally less for a near pointer', () => {
    expect(lookOffset({ x: 0, y: 0 }, { x: -FULL_LOOK_PX / 2, y: 0 }).x).toBeCloseTo(-MAX_LOOK / 2);
  });
});

describe('ElioAvatar', () => {
  beforeEach(() => {
    mockMedia(true);
  });

  it('next to an answer: a still picture that names Elio for screen readers', () => {
    const { container } = render(<ElioAvatar active />);

    expect(screen.getByText('Elio')).toBeDefined();
    expect(svgOf(container).getAttribute('aria-hidden')).toBe('true');
    const root = container.firstElementChild;
    expect(root?.hasAttribute('data-live')).toBe(false);
    // Still means still: not even the thinking light.
    expect(root?.hasAttribute('data-active')).toBe(false);
    expect(svgOf(container).hasAttribute('data-look')).toBe(false);
  });

  it('in the greeting: unnamed (the heading says it), live, and thinking while busy', () => {
    const { container } = render(<ElioAvatar size="lg" live active named={false} />);

    expect(screen.queryByText('Elio')).toBeNull();
    const root = container.firstElementChild;
    expect(root?.getAttribute('data-size')).toBe('lg');
    expect(root?.hasAttribute('data-live')).toBe(true);
    expect(root?.hasAttribute('data-active')).toBe(true);
  });

  it('a live avatar’s eyes follow the mouse, and stop when it unmounts', () => {
    runFrames();
    const { container, unmount } = render(<ElioAvatar size="lg" live named={false} />);
    const svg = svgOf(container);
    expect(svg.hasAttribute('data-look')).toBe(true);

    move(1000, 0);
    const lookX = Number(svg.style.getPropertyValue(LOOK_X));
    expect(lookX).toBeGreaterThan(0);
    expect(svg.style.getPropertyValue(LOOK_Y)).not.toBe('');

    unmount();
    svg.style.removeProperty(LOOK_X);
    move(-1000, 0);
    expect(svg.style.getPropertyValue(LOOK_X)).toBe('');
  });

  it('keeps the eyes still for touch screens and reduced motion', () => {
    mockMedia(false);
    const { container } = render(<ElioAvatar size="lg" live named={false} />);

    expect(svgOf(container).hasAttribute('data-look')).toBe(false);
  });

  it('ignores touch moves (a scroll or a drag, not someone looking around)', () => {
    runFrames();
    const { container } = render(<ElioAvatar size="lg" live named={false} />);
    const svg = svgOf(container);
    svg.style.removeProperty(LOOK_X);

    const touch = new MouseEvent('pointermove', { clientX: 1000, clientY: 0 });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    window.dispatchEvent(touch);

    expect(svg.style.getPropertyValue(LOOK_X)).toBe('');
  });

  it('every avatar has its own gradient ids', () => {
    const { container } = render(
      <>
        <ElioAvatar />
        <ElioAvatar />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((node) => node.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
