import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emitMapEvent } from '../../lib/viz/events';
import { KnowledgeMap, MAX_TOPICS, caption, prefersStillMap } from './KnowledgeMap';
import { KnowledgeMapRenderer } from './renderer';

// The canvas renderer is replaced: jsdom draws nothing, and the island's job here is the markup,
// the caption and the wiring. The renderer has its own tests.
const renderer = vi.hoisted(() => ({
  setPalette: vi.fn(),
  resize: vi.fn(),
  search: vi.fn(),
  light: vi.fn(),
  rest: vi.fn(),
  starAt: vi.fn(() => null),
  pointAt: vi.fn(),
  screenOf: vi.fn(() => ({ x: 10, y: 20 })),
  settlesIn: vi.fn(() => 0),
  destroy: vi.fn(),
}));
vi.mock('./renderer', () => ({
  KnowledgeMapRenderer: vi.fn(function KnowledgeMapRenderer() {
    return renderer;
  }),
}));

const DATA = {
  version: 'v',
  points: [
    {
      id: 'cv:brainrocket:0',
      x: 0.2,
      y: 0.3,
      source_type: 'cv',
      section: 'BrainRocket',
      title: 'CV — BrainRocket',
      c: ['brainrocket', 'angular'],
    },
    {
      id: 'personal:pet:0',
      x: 0.8,
      y: 0.7,
      source_type: 'personal',
      section: 'Pet',
      title: 'Personal facts — Pet',
      c: [],
    },
  ],
  concepts: [
    { id: 'brainrocket', label: 'BrainRocket', aliases: ['brainrocket'] },
    { id: 'angular', label: 'Angular', aliases: ['angular'] },
  ],
};

function stubFetch(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) })),
  );
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('KnowledgeMap', () => {
  it('introduces itself before any question', async () => {
    stubFetch(DATA);
    render(<KnowledgeMap />);

    expect(screen.getByRole('heading', { name: 'Knowledge map' })).toBeDefined();
    expect(screen.getByText(/Each dot is a passage Elio can read/)).toBeDefined();
    await waitFor(() => {
      expect(renderer.setPalette).toHaveBeenCalled();
    });
  });

  it('follows the chat: searching, then read with topics', async () => {
    stubFetch(DATA);
    render(<KnowledgeMap />);
    await waitFor(() => {
      expect(renderer.setPalette).toHaveBeenCalled();
    });

    act(() => {
      emitMapEvent('knowledge-map:turn', { phase: 'searching', sources: [], answer: '' });
    });
    expect(renderer.search).toHaveBeenCalledOnce();
    expect(screen.getByText(/Looking for passages/)).toBeDefined();

    const read = { phase: 'read' as const, sources: [{ id: 'cv:brainrocket:0', score: 0.9 }] };
    act(() => {
      emitMapEvent('knowledge-map:turn', { ...read, answer: 'Angular at BrainRocket' });
      // Streaming text later: the same sources must not ignite again.
      emitMapEvent('knowledge-map:turn', { ...read, answer: 'Angular at BrainRocket, more' });
    });
    expect(renderer.light).toHaveBeenCalledOnce();
    expect(screen.getByText('Topics: Angular · BrainRocket')).toBeDefined();
  });

  it('hides itself when the points file is missing or malformed', async () => {
    stubFetch({ version: 'v', points: 'nope' });
    const { container } = render(<KnowledgeMap />);

    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('shows a tooltip on the star of a source pointed at in the answer', async () => {
    stubFetch(DATA);
    render(<KnowledgeMap />);
    await waitFor(() => {
      expect(renderer.setPalette).toHaveBeenCalled();
    });
    act(() => {
      emitMapEvent('knowledge-map:turn', {
        phase: 'read',
        sources: [{ id: 'cv:brainrocket:0', score: 0.83 }],
        answer: '',
      });
      emitMapEvent('knowledge-map:point-source', { id: 'cv:brainrocket:0' });
    });

    expect(renderer.pointAt).toHaveBeenLastCalledWith('cv:brainrocket:0', true);
    expect(screen.getByText('CV — BrainRocket')).toBeDefined();
    expect(screen.getByText('Read for this answer · relevance 0.83')).toBeDefined();
  });

  it('marks the card when slow frames switch the map to light mode', async () => {
    stubFetch(DATA);
    render(<KnowledgeMap />);
    await waitFor(() => {
      expect(KnowledgeMapRenderer).toHaveBeenCalled();
    });
    const card = screen.getByRole('region', { name: 'Knowledge map' });
    expect(card.hasAttribute('data-slow-frames')).toBe(false);

    const options = vi.mocked(KnowledgeMapRenderer).mock.calls[0]?.[2];
    act(() => {
      options?.onSlow?.();
    });

    expect(card.hasAttribute('data-slow-frames')).toBe(true);
  });

  it('opens the explainer, moves focus into it and back on Escape', async () => {
    stubFetch(DATA);
    const user = userEvent.setup();
    render(<KnowledgeMap />);
    const button = screen.getByRole('button', { name: 'What is this?' });

    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Got it' }));

    await user.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });
});

describe('caption', () => {
  it('counts passages, names topics and trims a long list', () => {
    const topics = Array.from({ length: MAX_TOPICS + 2 }, (_, i) => `T${String(i)}`);
    const text = caption(
      { phase: 'read', sources: [{ id: 'a', score: 1 }], answer: '' },
      topics,
      true,
    );

    expect(text.text).toBe(
      'Elio read 1 passage for this answer. Hover a star or a source to see what it is.',
    );
    expect(text.topics).toMatch(/^Topics: T0 · T1 .* \+2 more$/);
  });

  it('explains an empty search and a reply without one', () => {
    expect(caption({ phase: 'read', sources: [], answer: '' }, [], false).text).toMatch(
      /Nothing in Ivan’s materials matched/,
    );
    expect(caption({ phase: 'none', sources: [], answer: '' }, [], false).text).toMatch(
      /didn’t need a search/,
    );
  });
});

describe('prefersStillMap', () => {
  const nav = (fields: Record<string, unknown>) =>
    ({ hardwareConcurrency: 8, ...fields }) as unknown as Navigator;
  const media = (reduce: boolean) => () => ({ matches: reduce }) as MediaQueryList;

  it('moves on a capable device without a reduced-motion preference', () => {
    expect(prefersStillMap(nav({}), media(false))).toBe(false);
  });

  it.each([
    ['reduced motion', nav({}), true],
    ['few cores', nav({ hardwareConcurrency: 4 }), false],
    ['little memory', nav({ deviceMemory: 2 }), false],
    ['data saver', nav({ connection: { saveData: true } }), false],
  ])('stays still with %s', (_case, navigator, reduce) => {
    expect(prefersStillMap(navigator, media(reduce))).toBe(true);
  });
});
