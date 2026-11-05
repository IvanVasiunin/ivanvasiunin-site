// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { HISTORY_STORAGE_KEY, MAX_STORED_TURNS, clearTurns, loadTurns, saveTurns } from './history';
import type { Turn } from './state';

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
    ['a question over the limit', JSON.stringify([{ ...turn(), question: 'x'.repeat(501) }])],
    ['a repeated turn id', JSON.stringify([turn(), turn()])],
    ['an answer over the limit', JSON.stringify([{ ...turn(), answer: 'x'.repeat(20_001) }])],
  ])('restores nothing from %s', (_case, stored) => {
    const { items, storage } = memoryStorage();
    items.set(HISTORY_STORAGE_KEY, stored);

    expect(loadTurns(storage)).toEqual([]);
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
