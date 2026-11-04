import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BRAINROCKET_ANSWER, mockScenario, toSse } from '../../lib/chat/mock/scenarios';
import { CHAT_ENDPOINT } from '../../lib/sse/client';
import { Chat, EXAMPLE_QUESTIONS, exampleHref } from './Chat';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { keyboardInset } from './useKeyboardInset';

/** The JSON body a test fetch was called with. */
const jsonBody = (init: RequestInit | undefined): unknown =>
  typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;

/** A fetch that answers like the mocked API: the scenario for the question, all at once. */
function scenarioFetch() {
  return vi.fn<typeof fetch>((_input, init) => {
    const body = jsonBody(init);
    const question =
      typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : '';
    const scenario = mockScenario(question);
    if (scenario.kind === 'http-error') {
      return Promise.resolve(Response.json(scenario.body, { status: scenario.status }));
    }
    const text = scenario.steps.map((step) => toSse(step.event)).join('');
    return Promise.resolve(
      new Response(text, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
  });
}

/** A fetch whose stream sends `route` and then waits until it is aborted. */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
    const signal = init?.signal ?? new AbortController().signal;
    signals.push(signal);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(toSse({ type: 'route', route: 'about_ivan', language: 'en' })),
        );
        signal.addEventListener('abort', () => {
          controller.error(new DOMException('Aborted', 'AbortError'));
        });
      },
    });
    return Promise.resolve(
      new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
  });
  return { fetchImpl, signals };
}

const input = () => screen.getByRole('textbox', { name: 'Ask Elio about Ivan' });
const liveRegion = () => document.querySelector('[aria-live="polite"]');

let turnCounter = 0;
const newTurnId = () => `turn-${String((turnCounter += 1))}`;

beforeEach(() => {
  // jsdom has no layout or media queries: scrolling is a no-op and no reduced-motion preference.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: false, media: query }) as MediaQueryList),
  );
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Chat', () => {
  describe('empty', () => {
    it('introduces Elio, with the disclosure and three example questions', () => {
      render(<Chat fetchImpl={scenarioFetch()} />);

      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        'Ask Elio about Ivan’s work',
      );
      expect(screen.getByText(/Elio is an AI assistant and can be wrong/)).toBeDefined();
      expect(screen.getByRole('link', { name: 'How chats are handled' }).getAttribute('href')).toBe(
        '/privacy',
      );
      const examples = screen.getAllByRole('link', { name: /\?$/ });
      expect(examples.map((link) => link.textContent)).toEqual(EXAMPLE_QUESTIONS);
      expect(examples[0]?.getAttribute('href')).toBe(exampleHref(EXAMPLE_QUESTIONS[0] ?? ''));
    });

    it('shows the CV button passed by the page', () => {
      render(<Chat fetchImpl={scenarioFetch()} cv={<a href="/cv">Read the CV</a>} />);

      expect(screen.getByRole('link', { name: 'Read the CV' })).toBeDefined();
    });

    it('an example question fills and focuses the input, and never sends', async () => {
      const fetchImpl = scenarioFetch();
      render(<Chat fetchImpl={fetchImpl} />);

      await userEvent.click(
        screen.getByRole('link', { name: 'Which technologies does Ivan use?' }),
      );

      expect(input()).toHaveProperty('value', 'Which technologies does Ivan use?');
      expect(document.activeElement).toBe(input());
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('?q= fills and focuses the input, and never sends', async () => {
      window.history.replaceState(null, '', '/?q=Did%20Ivan%20mentor%20anyone%3F');
      const fetchImpl = scenarioFetch();
      render(<Chat fetchImpl={fetchImpl} />);

      await waitFor(() => {
        expect(input()).toHaveProperty('value', 'Did Ivan mentor anyone?');
      });
      expect(document.activeElement).toBe(input());
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('a question', () => {
    it('posts it with the session and streams the answer with its sources', async () => {
      const fetchImpl = scenarioFetch();
      render(<Chat fetchImpl={fetchImpl} newTurnId={newTurnId} />);

      await userEvent.type(input(), 'What did Ivan do at BrainRocket?{Enter}');

      expect(fetchImpl).toHaveBeenCalledWith(CHAT_ENDPOINT, expect.anything());
      const body = jsonBody(fetchImpl.mock.calls[0]?.[1]);
      expect(body).toMatchObject({ message: 'What did Ivan do at BrainRocket?', history: [] });
      expect(body).toHaveProperty('session_id', expect.stringMatching(/^[0-9a-f-]{36}$/));

      expect(
        await screen.findByRole('heading', { level: 2, name: 'What did Ivan do at BrainRocket?' }),
      ).toBeDefined();
      expect(await screen.findByRole('button', { name: 'Copy' })).toBeDefined();
      expect(screen.getByRole('region', { name: 'Sources' })).toBeDefined();
      expect(screen.getByText('Homepage performance.')).toBeDefined();
      // The input is cleared for the next question; the examples are gone.
      expect(input()).toHaveProperty('value', '');
      expect(screen.queryByRole('list', { name: 'Example questions' })).toBeNull();
    });

    it('announces the finished answer once, as plain text', async () => {
      render(<Chat fetchImpl={scenarioFetch()} newTurnId={newTurnId} />);

      await userEvent.type(input(), 'BrainRocket?{Enter}');
      await screen.findByRole('button', { name: 'Copy' });

      const announced = liveRegion()?.textContent ?? '';
      expect(announced.startsWith('Elio: At BrainRocket, Ivan works')).toBe(true);
      expect(announced).not.toContain('**');
      expect(BRAINROCKET_ANSWER).toContain('**');
    });

    it('sends the earlier answer as history with the next question', async () => {
      const fetchImpl = scenarioFetch();
      render(<Chat fetchImpl={fetchImpl} newTurnId={newTurnId} />);

      await userEvent.type(input(), 'Hello{Enter}');
      await screen.findByRole('button', { name: 'Copy' });
      await userEvent.type(input(), 'BrainRocket?{Enter}');

      const body = jsonBody(fetchImpl.mock.calls[1]?.[1]);
      expect(body).toHaveProperty('history', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: expect.stringContaining("I'm Elio") as unknown },
      ]);
    });
  });

  describe('loading and Stop', () => {
    it('turns Send into Stop; Stop aborts, keeps the turn as "Stopped" and refocuses the input', async () => {
      const { fetchImpl, signals } = hangingFetch();
      render(<Chat fetchImpl={fetchImpl} newTurnId={newTurnId} />);

      await userEvent.type(input(), 'BrainRocket?{Enter}');
      expect(await screen.findByText('Searching sources')).toBeDefined();

      await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

      expect(signals[0]?.aborted).toBe(true);
      expect(await screen.findByText('Stopped before the answer started.')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Send' })).toBeDefined();
      expect(document.activeElement).toBe(input());
      await waitFor(() => {
        expect(liveRegion()?.textContent).toBe('Stopped');
      });
    });

    it('aborts the stream when the chat unmounts', async () => {
      const { fetchImpl, signals } = hangingFetch();
      const { unmount } = render(<Chat fetchImpl={fetchImpl} newTurnId={newTurnId} />);

      await userEvent.type(input(), 'BrainRocket?{Enter}');
      await screen.findByText('Searching sources');
      unmount();

      expect(signals[0]?.aborted).toBe(true);
    });
  });

  describe('errors', () => {
    it('shows a rate limit with when to try again, and announces it', async () => {
      render(<Chat fetchImpl={scenarioFetch()} newTurnId={newTurnId} />);

      await userEvent.type(input(), 'Test the limit{Enter}');

      const turn = await screen.findByRole('article');
      expect(within(turn).getByText('Too many questions in a short time.')).toBeDefined();
      expect(within(turn).getByText(/Try again in 30 seconds/)).toBeDefined();
      await waitFor(() => {
        expect(liveRegion()?.textContent).toContain('Too many questions');
      });
    });

    it('keeps the partial answer when the stream fails, and retries in place', async () => {
      const fetchImpl = scenarioFetch();
      render(<Chat fetchImpl={fetchImpl} newTurnId={newTurnId} />);

      await userEvent.type(input(), 'Make it fail{Enter}');
      expect(await screen.findByText('Elio cannot be reached right now.')).toBeDefined();

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(screen.getAllByRole('article')).toHaveLength(1);
    });
  });
});

describe('ChatErrorBoundary', () => {
  it('shows the fallback instead of a crashed chat', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Crash = (): never => {
      throw new Error('boom');
    };

    render(
      <ChatErrorBoundary fallback={<p>The chat could not start.</p>}>
        <Crash />
      </ChatErrorBoundary>,
    );

    expect(screen.getByText('The chat could not start.')).toBeDefined();
  });
});

describe('keyboardInset', () => {
  it('measures the part of the layout viewport the keyboard covers', () => {
    expect(keyboardInset(800, { height: 480, offsetTop: 0, scale: 1 })).toBe(320);
    expect(keyboardInset(800, { height: 450, offsetTop: 30, scale: 1 })).toBe(320);
  });

  it('ignores a pinch zoom, which shrinks the visual viewport too', () => {
    expect(keyboardInset(800, { height: 400, offsetTop: 0, scale: 2 })).toBe(0);
  });

  it('ignores small differences from browser chrome', () => {
    expect(keyboardInset(800, { height: 740, offsetTop: 0, scale: 1 })).toBe(0);
  });
});

// The live region is the only announcer: the streamed answer itself is not in a live region.
describe('Chat accessibility', () => {
  it('keeps streaming text out of live regions', async () => {
    render(<Chat fetchImpl={scenarioFetch()} newTurnId={newTurnId} />);

    await userEvent.type(input(), 'BrainRocket?{Enter}');
    await screen.findByRole('button', { name: 'Copy' });

    const regions = document.querySelectorAll('[aria-live], [role="log"], [role="status"]');
    expect(regions).toHaveLength(1);
    await act(() => Promise.resolve());
  });
});
