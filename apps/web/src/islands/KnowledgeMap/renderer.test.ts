import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MapPoint } from '../../lib/viz/points';
import { KnowledgeMapRenderer, type MapPalette } from './renderer';

// jsdom has no 2D canvas: a recording stand-in for the context, and a manual frame clock.
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return new Proxy(
    { createRadialGradient: () => gradient },
    {
      get: (target, key) => (key in target ? target[key as keyof typeof target] : vi.fn()),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

let frames: FrameRequestCallback[] = [];
let clock = 0;

function runFrames(ms: number, step = 16): void {
  const end = clock + ms;
  while (frames.length > 0 && clock < end) {
    clock += step;
    const due = frames;
    frames = [];
    for (const callback of due) callback(clock);
  }
}

beforeEach(() => {
  frames = [];
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const POINTS: MapPoint[] = Array.from({ length: 12 }, (_, i) => ({
  id: `cv:p:${String(i)}`,
  x: (i % 4) / 4,
  y: Math.floor(i / 4) / 3,
  sourceType: i % 3 === 0 ? 'site_docs' : 'cv',
  section: 's',
  title: 't',
  concepts: [],
}));

const PALETTE: MapPalette = {
  sources: {
    cv: [1, 2, 3],
    experience: [1, 2, 3],
    personal: [1, 2, 3],
    site_docs: [1, 2, 3],
    github_readme: [1, 2, 3],
  },
  label: '#fff',
  dust: '#fff',
  font: 'sans-serif',
};

function make(instant = false, onSlow?: () => void): KnowledgeMapRenderer {
  const renderer = new KnowledgeMapRenderer(document.createElement('canvas'), POINTS, {
    instant: () => instant,
    regionLabels: { career: 'CAREER', personal: 'PERSONAL', site: 'THIS SITE' },
    ...(onSlow ? { onSlow } : {}),
  });
  renderer.setPalette(PALETTE);
  renderer.resize(400, 600, 1);
  return renderer;
}

describe('KnowledgeMapRenderer', () => {
  it('stops drawing at rest: no frame loop without motion', () => {
    const renderer = make();

    runFrames(100);

    expect(renderer.animating).toBe(false);
  });

  it('animates while stars ignite, then stops by itself', () => {
    const renderer = make();
    runFrames(100);

    renderer.light([
      { id: 'cv:p:1', score: 0.9 },
      { id: 'cv:p:2', score: 0.5 },
    ]);
    runFrames(1000);
    expect(renderer.animating).toBe(true);

    runFrames(5000);
    expect(renderer.animating).toBe(false);
  });

  it('with reduced motion it reaches the final state in one frame', () => {
    const renderer = make(true);

    renderer.light([{ id: 'cv:p:1', score: 0.9 }]);
    runFrames(50);

    expect(renderer.animating).toBe(false);
  });

  it('switches to light mode when an ignition stutters, and stays there', () => {
    const onSlow = vi.fn();
    const renderer = make(false, onSlow);
    runFrames(100);

    renderer.light([{ id: 'cv:p:1', score: 0.9 }]);
    // 80 ms a frame all the way through: judged slow when the ignition ends.
    runFrames(6000, 80);

    expect(onSlow).toHaveBeenCalledOnce();
    expect(renderer.animating).toBe(false);

    // The next answer: final state in one frame, at normal frame times too.
    renderer.light([{ id: 'cv:p:2', score: 0.9 }]);
    runFrames(50);
    expect(renderer.animating).toBe(false);
    expect(onSlow).toHaveBeenCalledOnce();
  });

  it('keeps the motion on a device with smooth frames', () => {
    const onSlow = vi.fn();
    const renderer = make(false, onSlow);

    renderer.light([{ id: 'cv:p:1', score: 0.9 }]);
    runFrames(1000);

    expect(onSlow).not.toHaveBeenCalled();
    expect(renderer.animating).toBe(true);
  });

  it('finds the star under the pointer, and nothing in empty sky', () => {
    const renderer = make(true);
    const at = renderer.screenOf('cv:p:5');

    expect(at).not.toBeNull();
    expect(renderer.starAt(at?.x ?? 0, at?.y ?? 0)).toBe('cv:p:5');
    expect(renderer.starAt(-500, -500)).toBeNull();
  });

  it('stops its loop when destroyed', () => {
    const renderer = make();
    renderer.light([{ id: 'cv:p:1', score: 0.9 }]);

    renderer.destroy();

    expect(renderer.animating).toBe(false);
  });
});
