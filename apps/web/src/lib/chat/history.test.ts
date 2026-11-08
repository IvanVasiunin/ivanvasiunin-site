// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { HISTORY_STORAGE_KEY, MAX_STORED_TURNS, clearTurns, loadTurns, saveTurns } from './history';
import { MAX_QUESTION_CHARS, type Turn } from './state';

/** An in-memory Storage with only the methods history.ts uses. */
function memoryStorage() {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
  return { items, storage: () => storage };
}

const turn = (overrides: Partial<Turn> = {}): Turn => ({
  id: 'turn-1',
  question: 'What did Ivan do at BrainRocket?',
  answer: 'He builds UI.',
  status: 'done',
  step: 'writing',
  route: 'about_ivan',
  language: 'en',
  sources: [
    {
      chunk_id: 'cv:brainrocket:0',
      score: 0.8,
      source_type: 'cv',
      title: 'CV — BrainRocket',
      section: null,
      url: '/cv#job-brainrocket',
      snippet: 'Builds UI.',
    },
  ],
  usage: null,
  error: null,
  finishReason: 'stop',
  ...overrides,
});

describe('conversation history', () => {
  it('round-trips a conversation', () => {
    const { storage } = memoryStorage();
    const turns = [
      turn(),
      turn({
        id: 'turn-2',
        status: 'error',
        answer: '',
        error: { code: 'timeout', retryAfterS: null },
        finishReason: null,
      }),
    ];

    saveTurns(turns, storage);

    expect(loadTurns(storage)).toEqual(turns);
  });

  it('brings an interrupted answer back as Stopped', () => {
    const { storage } = memoryStorage();

    saveTurns([turn({ status: 'streaming', finishReason: null })], storage);

    expect(loadTurns(storage)[0]?.status).toBe('stopped');
  });

  it('keeps only the latest turns', () => {
    const { items, storage } = memoryStorage();
    const many = Array.from({ length: MAX_STORED_TURNS + 5 }, (_, index) =>
      turn({ id: `turn-${String(index)}` }),
    );

    saveTurns(many, storage);

    const stored = JSON.parse(items.get(HISTORY_STORAGE_KEY) ?? '[]') as unknown[];
    expect(stored).toHaveLength(MAX_STORED_TURNS);
    expect(loadTurns(storage)[0]?.id).toBe('turn-5');
  });

  it.each([
    ['not JSON', '{'],
    ['not a list', '{"turns": []}'],
    ['a turn without fields', '[{"id": "x"}]'],
    ['an unknown status', JSON.stringify([{ ...turn(), status: 'hacked' }])],
    [
      'an unsafe source link',
      JSON.stringify([{ ...turn(), sources: [{ ...turn().sources[0], source_type: 'evil' }] }]),
    ],
    [
      'an unknown error code',
      JSON.stringify([{ ...turn(), error: { code: 'nope', retryAfterS: null } }]),
    ],
    [
      'a question over the limit',
      JSON.stringify([{ ...turn(), question: 'x'.repeat(MAX_QUESTION_CHARS + 1) }]),
    ],
    ['a repeated turn id', JSON.stringify([turn(), turn()])],
    ['an answer over the limit', JSON.stringify([{ ...turn(), answer: 'x'.repeat(20_001) }])],
    ['usage that is not an object', JSON.stringify([{ ...turn(), usage: 'lots' }])],
    [
      'usage without a total',
      JSON.stringify([{ ...turn(), usage: { nodes: [], estimated_cost_usd: 0 } }]),
    ],
    ['a language that is not a code', JSON.stringify([{ ...turn(), language: 'x'.repeat(17) }])],
  ])('restores nothing from %s', (_case, stored) => {
    const { items, storage } = memoryStorage();
    items.set(HISTORY_STORAGE_KEY, stored);

    expect(loadTurns(storage)).toEqual([]);
  });

  it('keeps Under the hood across pages: usage and language round-trip', () => {
    const { storage } = memoryStorage();
    const usage = {
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
      total_ms: 312,
      estimated_cost_usd: 0.0001,
    };

    saveTurns([turn({ usage, language: 'es' })], storage);

    expect(loadTurns(storage)[0]).toMatchObject({ usage, language: 'es' });
  });

  it('a turn stored before Under the hood comes back without it', () => {
    const { items, storage } = memoryStorage();
    // JSON drops `undefined` fields: the stored turn has neither key, as one saved before 5.2.
    const older = { ...turn(), usage: undefined, language: undefined };
    items.set(HISTORY_STORAGE_KEY, JSON.stringify([older]));
    expect(items.get(HISTORY_STORAGE_KEY)).not.toContain('usage');

    expect(loadTurns(storage)[0]).toMatchObject({ usage: null, language: null });
  });

  it('a stored step keeps only the contract fields', () => {
    const { items, storage } = memoryStorage();
    const node = { name: 'router', ms: 1, prompt: 'SECRET' };
    const usage = { nodes: [node], total_ms: 1, estimated_cost_usd: 0 };
    items.set(HISTORY_STORAGE_KEY, JSON.stringify([{ ...turn(), usage }]));

    expect(JSON.stringify(loadTurns(storage))).not.toContain('SECRET');
  });

  it('a stored source link is cleaned like a live one', () => {
    const { items, storage } = memoryStorage();
    const source = { ...turn().sources[0], url: 'javascript:alert(1)' };
    items.set(HISTORY_STORAGE_KEY, JSON.stringify([{ ...turn(), sources: [source] }]));

    expect(loadTurns(storage)[0]?.sources[0]?.url).toBeNull();
  });

  it('clearTurns forgets the conversation', () => {
    const { items, storage } = memoryStorage();
    saveTurns([turn()], storage);

    clearTurns(storage);

    expect(items.has(HISTORY_STORAGE_KEY)).toBe(false);
  });

  it('never throws when storage is unavailable', () => {
    const broken = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };

    expect(() => {
      saveTurns([turn()], broken);
      clearTurns(broken);
    }).not.toThrow();
    expect(loadTurns(broken)).toEqual([]);
  });
});
