// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { ChatEvent, SourceItem } from '../api/types';
import {
  type ChatAction,
  type ChatState,
  HISTORY_TURNS,
  INITIAL_CHAT_STATE,
  canRetry,
  chatReducer,
  historyBefore,
  isBusy,
} from './state';

const SOURCE: SourceItem = {
  chunk_id: 'cv:brainrocket:3',
  score: 0.83,
  source_type: 'cv',
  title: 'BrainRocket — Senior Markup Developer',
  section: 'Highlights',
  url: '/cv#brainrocket',
  snippet: 'Traced a homepage performance problem to CSS masks…',
};

const run = (actions: readonly ChatAction[], state: ChatState = INITIAL_CHAT_STATE): ChatState =>
  actions.reduce(chatReducer, state);

const send = (id: string, question = `Question ${id}`): ChatAction => ({
  type: 'send',
  id,
  question,
});
const event = (id: string, chatEvent: ChatEvent): ChatAction => ({
  type: 'event',
  id,
  event: chatEvent,
});
const token = (id: string, text: string): ChatAction => event(id, { type: 'token', text });
const done = (id: string): ChatAction =>
  event(id, { type: 'done', message_id: `m-${id}`, finish_reason: 'stop' });
const route = (id: string, to: 'about_ivan' | 'greeting' = 'about_ivan'): ChatAction =>
  event(id, { type: 'route', route: to, language: 'en' });

/** A turn that went the whole way: route, sources, tokens, done. */
const answered = (id: string): ChatAction[] => [
  send(id),
  route(id),
  event(id, { type: 'sources', items: [SOURCE] }),
  token(id, `Answer ${id}`),
  done(id),
];

const turn = (state: ChatState, index = 0) => {
  const found = state.turns[index];
  if (found === undefined) throw new Error(`no turn ${String(index)}`);
  return found;
};

describe('chatReducer', () => {
  it('adds a pending turn on send', () => {
    const state = run([send('a', 'What did Ivan do at BrainRocket?')]);

    expect(turn(state)).toMatchObject({
      question: 'What did Ivan do at BrainRocket?',
      status: 'pending',
      step: 'understanding',
      answer: '',
    });
    expect(isBusy(state)).toBe(true);
  });

  it('moves through the steps on route and sources, then streams tokens', () => {
    const routed = run([send('a'), route('a')]);
    expect(turn(routed).step).toBe('searching');

    const sourced = run([event('a', { type: 'sources', items: [SOURCE] })], routed);
    expect(turn(sourced)).toMatchObject({ step: 'writing', sources: [SOURCE] });

    const streaming = run([token('a', 'Ivan '), token('a', 'works')], sourced);
    expect(turn(streaming)).toMatchObject({ status: 'streaming', answer: 'Ivan works' });
  });

  it('skips the search step for a templated route', () => {
    const state = run([send('a'), route('a', 'greeting')]);

    expect(turn(state)).toMatchObject({ step: 'writing', route: 'greeting' });
  });

  it('finishes on done and is no longer busy', () => {
    const state = run(answered('a'));

    expect(turn(state)).toMatchObject({ status: 'done', finishReason: 'stop', answer: 'Answer a' });
    expect(isBusy(state)).toBe(false);
  });

  it('records an error with its code and delay', () => {
    const state = run([
      send('a'),
      event('a', { type: 'error', code: 'rate_limited', message: 'x', retry_after_s: 30 }),
    ]);

    expect(turn(state)).toMatchObject({
      status: 'error',
      error: { code: 'rate_limited', retryAfterS: 30 },
    });
  });

  it('keeps the partial answer on stop and ignores later events', () => {
    const state = run([send('a'), token('a', 'Ivan '), { type: 'stop', id: 'a' }, token('a', 'x')]);

    expect(turn(state)).toMatchObject({ status: 'stopped', answer: 'Ivan ' });
    expect(isBusy(state)).toBe(false);
  });

  it('ignores a second send while an answer is streaming', () => {
    const state = run([send('a'), send('b')]);

    expect(state.turns).toHaveLength(1);
  });

  it('keeps usage for Under the hood and changes nothing else (ROADMAP 5.2)', () => {
    const before = run([send('a'), token('a', 'Ivan')]);
    const nodes = [
      {
        name: 'router',
        ms: 310,
        model: 'gpt-6-luna',
        input_tokens: 412,
        cached_input_tokens: 0,
        output_tokens: 18,
        embedding_tokens: null,
      },
    ];
    const after = run(
      [event('a', { type: 'usage', nodes, total_ms: 10, estimated_cost_usd: 0.0001 })],
      before,
    );

    expect(turn(after).usage).toEqual({ nodes, total_ms: 10, estimated_cost_usd: 0.0001 });
    expect({ ...turn(after), usage: null }).toEqual(turn(before));
  });

  it('keeps the language the router detected', () => {
    const state = run([
      send('a'),
      event('a', { type: 'route', route: 'about_ivan', language: 'es' }),
    ]);

    expect(turn(state).language).toBe('es');
  });

  it("a retry clears the earlier answer's usage and language", () => {
    const state = run([
      send('a'),
      route('a'),
      event('a', { type: 'usage', nodes: [], total_ms: 10, estimated_cost_usd: 0 }),
      done('a'),
      { type: 'retry', id: 'a' },
    ]);

    expect(turn(state)).toMatchObject({ usage: null, language: null });
  });

  it('replaces the answer on retry instead of adding a turn', () => {
    const state = run([...answered('a'), { type: 'retry', id: 'a' }]);

    expect(state.turns).toHaveLength(1);
    expect(turn(state)).toMatchObject({
      question: 'Question a',
      answer: '',
      status: 'pending',
      sources: [],
    });
  });

  it('offers retry only on the last turn, once it has ended', () => {
    const streaming = run([...answered('a'), send('b'), token('b', 'x')]);
    expect(canRetry(streaming, 'a')).toBe(false);
    expect(canRetry(streaming, 'b')).toBe(false);

    const stopped = run([{ type: 'stop', id: 'b' }], streaming);
    expect(canRetry(stopped, 'b')).toBe(true);
    // A retry of an earlier turn is ignored: its follow-ups would no longer match it.
    expect(run([{ type: 'retry', id: 'a' }], stopped)).toBe(stopped);
  });
});

describe('historyBefore', () => {
  it('sends completed turns before the current one as user / assistant pairs', () => {
    const state = run([...answered('a'), send('b')]);

    expect(historyBefore(state, 'b')).toEqual([
      { role: 'user', content: 'Question a' },
      { role: 'assistant', content: 'Answer a' },
    ]);
  });

  it('leaves out stopped and failed answers', () => {
    const state = run([
      send('a'),
      token('a', 'half'),
      { type: 'stop', id: 'a' },
      send('b'),
      event('b', { type: 'error', code: 'timeout', message: 'x', retry_after_s: null }),
      send('c'),
    ]);

    expect(historyBefore(state, 'c')).toEqual([]);
  });

  it(`keeps only the last ${String(HISTORY_TURNS)} turns`, () => {
    const ids = Array.from({ length: HISTORY_TURNS + 2 }, (_, index) => `t${String(index)}`);
    const state = run([...ids.flatMap(answered), send('next')]);

    const history = historyBefore(state, 'next');

    expect(history).toHaveLength(HISTORY_TURNS * 2);
    expect(history[0]).toEqual({ role: 'user', content: 'Question t2' });
  });
});

describe('restore and clear', () => {
  const stored = chatReducer(INITIAL_CHAT_STATE, { type: 'send', id: 'old', question: 'Earlier?' });

  it('restores the stored conversation into an empty chat', () => {
    expect(chatReducer(INITIAL_CHAT_STATE, { type: 'restore', turns: stored.turns })).toEqual(
      stored,
    );
  });

  it('keeps a question asked before the restore ran, after the stored ones', () => {
    const asked = chatReducer(INITIAL_CHAT_STATE, { type: 'send', id: 'new', question: 'Now?' });

    const restored = chatReducer(asked, { type: 'restore', turns: stored.turns });

    expect(restored.turns.map((turn) => turn.id)).toEqual(['old', 'new']);
  });

  it('a turn already in the chat is not restored twice', () => {
    expect(chatReducer(stored, { type: 'restore', turns: stored.turns })).toEqual(stored);
  });

  it('clear empties the chat', () => {
    expect(chatReducer(stored, { type: 'clear' })).toEqual(INITIAL_CHAT_STATE);
  });
});
