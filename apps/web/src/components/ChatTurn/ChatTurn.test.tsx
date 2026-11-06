import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceItem } from '../../lib/api/types';
import type { Turn } from '../../lib/chat/state';
import { COPIED_MS, ChatTurn, type ChatTurnProps } from './ChatTurn';

const SOURCES: SourceItem[] = [
  {
    chunk_id: 'cv:brainrocket:2',
    score: 0.86,
    source_type: 'cv',
    title: 'CV — BrainRocket',
    section: 'Highlights',
    url: '/cv#job-brainrocket',
    snippet: 'Traced a poor Lighthouse result…',
  },
  {
    chunk_id: 'experience:brainrocket:1',
    score: 0.78,
    source_type: 'experience',
    title: 'Experience notes — BrainRocket',
    section: null,
    url: null,
    snippet: 'Led the team…',
  },
];

const turnWith = (changes: Partial<Turn>): Turn => ({
  id: 't1',
  question: 'What did Ivan do at BrainRocket?',
  answer: '',
  status: 'pending',
  step: 'understanding',
  route: null,
  language: null,
  sources: [],
  usage: null,
  error: null,
  finishReason: null,
  ...changes,
});

const DONE = turnWith({
  status: 'done',
  answer: 'Ivan works on **iGaming** platforms.',
  route: 'about_ivan',
  sources: SOURCES,
  finishReason: 'stop',
});

function setup(turn: Turn, overrides: Partial<ChatTurnProps> = {}) {
  const props: ChatTurnProps = {
    turn,
    canRetry: true,
    onRetry: vi.fn(),
    onAnnounce: vi.fn(),
    ...overrides,
  };
  render(<ChatTurn {...props} />);
  return props;
}

/** Replaces the browser's clipboard for one test (jsdom has none). */
function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ChatTurn', () => {
  it('makes the question the turn heading', () => {
    setup(DONE);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'What did Ivan do at BrainRocket?',
    );
    expect(screen.getByRole('article', { name: 'What did Ivan do at BrainRocket?' })).toBeDefined();
  });

  describe('loading', () => {
    it('shows the steps and Elio at work before the first token', () => {
      setup(turnWith({ status: 'pending', step: 'searching', route: 'about_ivan' }));

      expect(screen.getByRole('list', { name: 'Elio is preparing the answer' })).toBeDefined();
      expect(screen.getByText('Searching sources').getAttribute('aria-current')).toBe('step');
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('skips the search step for a templated answer', () => {
      setup(turnWith({ status: 'pending', step: 'writing', route: 'greeting' }));

      expect(screen.queryByText('Searching sources')).toBeNull();
    });

    it('streams the answer without actions', () => {
      setup(turnWith({ status: 'streaming', answer: 'Ivan works', step: 'writing' }));

      expect(screen.getByText('Ivan works')).toBeDefined();
      expect(screen.queryByRole('list', { name: 'Elio is preparing the answer' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    });
  });

  describe('default (a finished answer)', () => {
    it('renders the answer as Markdown', () => {
      setup(DONE);

      expect(screen.getByText('iGaming').tagName).toBe('STRONG');
    });

    it('lists the sources, linking the ones with a page', () => {
      setup(DONE);

      const sources = screen.getByRole('region', { name: 'Sources' });
      expect(
        within(sources).getByRole('link', { name: 'CV — BrainRocket' }).getAttribute('href'),
      ).toBe('/cv#job-brainrocket');
      expect(within(sources).getByText('Experience notes — BrainRocket').closest('a')).toBeNull();
      // The kind is told in text too, not by the dot colour alone.
      expect(within(sources).getByText(', Experience notes')).toBeDefined();
    });

    it('has no sources for a templated answer', () => {
      setup({ ...DONE, route: 'greeting', sources: [], finishReason: 'templated' });

      expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull();
    });

    it('copies the Markdown source and confirms it', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      const props = setup(DONE);

      await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

      expect(writeText).toHaveBeenCalledWith('Ivan works on **iGaming** platforms.');
      expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined();
      expect(props.onAnnounce).toHaveBeenCalledWith('Copied');
    });

    it('goes back from "Copied" to "Copy" after a while', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      setup(DONE);

      await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
      act(() => {
        vi.advanceTimersByTime(COPIED_MS);
      });

      expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined();
    });

    it('tells the reader when copying fails', async () => {
      stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
      const props = setup(DONE);

      await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

      expect(props.onAnnounce).toHaveBeenCalledWith(expect.stringMatching(/^Copying failed/));
    });

    it('retries the last answer', async () => {
      const props = setup(DONE);

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(props.onRetry).toHaveBeenCalledWith('t1');
      // The button goes away while the answer is regenerated: focus moves to the turn.
      expect(document.activeElement).toBe(screen.getByRole('article'));
    });

    it('offers no retry on an earlier turn', () => {
      setup(DONE, { canRetry: false });

      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });
  });

  describe('stopped', () => {
    it('keeps the partial answer, marked "Stopped", with Retry', () => {
      setup(turnWith({ status: 'stopped', answer: 'Ivan works' }));

      expect(screen.getByText('Ivan works')).toBeDefined();
      expect(screen.getByText('Stopped')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
    });

    it('says when it stopped before any text', () => {
      setup(turnWith({ status: 'stopped' }));

      expect(screen.getByText('Stopped before the answer started.')).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    });
  });

  describe('error', () => {
    it('shows a human message with when to try again, and Retry', () => {
      setup(turnWith({ status: 'error', error: { code: 'rate_limited', retryAfterS: 30 } }));

      expect(screen.getByText('Too many questions in a short time.')).toBeDefined();
      expect(screen.getByText(/Try again in 30 seconds\./)).toBeDefined();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
    });

    it('offers no Retry when retrying cannot help', () => {
      setup(turnWith({ status: 'error', error: { code: 'budget_exceeded', retryAfterS: null } }));

      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });
  });
  describe('Under the hood', () => {
    const USAGE = {
      nodes: [
        {
          name: 'router',
          ms: 310,
          model: 'gpt-6-luna',
          input_tokens: 412,
          cached_input_tokens: 0,
          output_tokens: 18,
          embedding_tokens: null,
        },
      ],
      total_ms: 2273,
      estimated_cost_usd: 0.0061,
    };
    const WITH_USAGE = { ...DONE, usage: USAGE, language: 'en' };
    const toggle = () => screen.getByRole('button', { name: /Under the hood/ });
    const panel = () => document.getElementById(toggle().getAttribute('aria-controls') ?? '');
    let scrollIntoView: ReturnType<typeof vi.fn>;

    /** jsdom has neither `matchMedia` nor `scrollIntoView`; `reduce` answers the motion query. */
    function stubBrowser(reduce: boolean): void {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: reduce && query.includes('reduce'),
      }));
      scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];
    }

    beforeEach(() => {
      stubBrowser(false);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('is a collapsed toggle with the time and cost in its name', () => {
      setup(WITH_USAGE);

      // The visible summary is part of the name (WCAG 2.5.3, axe label-content-name-mismatch).
      expect(screen.getByRole('button', { name: 'Under the hood 2.3 s · $0.0061' })).toBe(toggle());
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(toggle().textContent).toBe('Under the hood 2.3 s · $0.0061');
      const panel = document.getElementById(toggle().getAttribute('aria-controls') ?? '');
      expect(panel?.hidden).toBe(true);
    });

    it('opens and closes with a click, and focus stays on the toggle', async () => {
      const user = userEvent.setup();
      setup(WITH_USAGE);

      await user.click(toggle());
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      const panel = document.getElementById(toggle().getAttribute('aria-controls') ?? '');
      expect(panel?.hidden).toBe(false);
      expect(within(panel ?? document.body).getByText('About Ivan · en')).toBeDefined();
      expect(document.activeElement).toBe(toggle());

      await user.click(toggle());
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('scrolls the whole panel into view when it opens', async () => {
      const user = userEvent.setup();
      setup(WITH_USAGE);

      await user.click(toggle());

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    });

    /** The end of the panel's fold (jsdom has no TransitionEvent: both names, with the property). */
    function foldEnds(target: Element, propertyName = 'grid-template-rows'): void {
      for (const name of ['transitionend', 'webkitTransitionEnd']) {
        fireEvent(target, Object.assign(new Event(name, { bubbles: true }), { propertyName }));
      }
    }

    it('folds when closed: hidden once the fold has ended', async () => {
      const user = userEvent.setup();
      setup(WITH_USAGE);
      await user.click(toggle());

      await user.click(toggle());

      // Closed for assistive tech at once; still painted while it folds.
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(panel()?.dataset.state).toBe('closing');
      expect(panel()?.hidden).toBe(false);
      // A transition inside the panel (the card's fade) does not end the fold.
      foldEnds(panel()?.querySelector('.under-the-hood__card') ?? document.body, 'opacity');
      expect(panel()?.hidden).toBe(false);
      foldEnds(panel() ?? document.body);
      expect(panel()?.hidden).toBe(true);
    });

    it('closes anyway if the fold never reports its end', () => {
      vi.useFakeTimers();
      setup(WITH_USAGE);
      fireEvent.click(toggle());
      fireEvent.click(toggle());

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(panel()?.hidden).toBe(true);
    });

    it('reopens while folding', async () => {
      const user = userEvent.setup();
      setup(WITH_USAGE);
      await user.click(toggle());
      await user.click(toggle());

      await user.click(toggle());

      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(panel()?.dataset.state).toBe('open');
    });

    it('with reduced motion it closes at once and scrolls without animation', async () => {
      stubBrowser(true);
      const user = userEvent.setup();
      setup(WITH_USAGE);

      await user.click(toggle());
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'instant' });
      await user.click(toggle());

      expect(panel()?.hidden).toBe(true);
    });

    it('works from the keyboard with Enter and Space', async () => {
      const user = userEvent.setup();
      setup(WITH_USAGE);

      toggle().focus();
      await user.keyboard('{Enter}');
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      await user.keyboard(' ');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('is not offered before the answer has finished, nor without usage', () => {
      setup(turnWith({ status: 'streaming', answer: 'Ivan', usage: USAGE }));
      expect(screen.queryByRole('button', { name: /Under the hood/ })).toBeNull();
    });

    it('is not offered for an answer that has no usage', () => {
      setup(DONE);
      expect(screen.queryByRole('button', { name: /Under the hood/ })).toBeNull();
    });
  });
});
