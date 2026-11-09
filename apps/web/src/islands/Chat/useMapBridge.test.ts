import { describe, expect, it } from 'vitest';

import type { SourceItem } from '../../lib/api/types';
import type { ChatState, Turn } from '../../lib/chat/state';
import { REST_TURN, mapTurnOf } from './useMapBridge';

const SOURCE: SourceItem = {
  chunk_id: 'cv:brainrocket:0',
  score: 0.9,
  source_type: 'cv',
  title: 'CV — BrainRocket',
  section: null,
  url: null,
  snippet: 'x',
};

const turn = (changes: Partial<Turn>): Turn => ({
  id: 't1',
  question: 'q',
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

const state = (...turns: Turn[]): ChatState => ({ turns });

describe('mapTurnOf', () => {
  it('rests with no conversation', () => {
    expect(mapTurnOf(state())).toEqual(REST_TURN);
  });

  it('searches while a question about Ivan has no sources yet', () => {
    expect(mapTurnOf(state(turn({})))).toMatchObject({ phase: 'searching' });
    expect(mapTurnOf(state(turn({ route: 'about_ivan' })))).toMatchObject({ phase: 'searching' });
  });

  it('reads the latest turn’s sources, with the answer so far', () => {
    const t = turn({ route: 'about_ivan', status: 'streaming', answer: 'Ivan', sources: [SOURCE] });

    expect(mapTurnOf(state(turn({ id: 't0', status: 'done' }), t))).toEqual({
      phase: 'read',
      sources: [{ id: 'cv:brainrocket:0', score: 0.9 }],
      answer: 'Ivan',
    });
  });

  it('reads nothing when a finished search found nothing relevant', () => {
    expect(
      mapTurnOf(state(turn({ route: 'about_ivan', status: 'done', answer: 'No info' }))),
    ).toMatchObject({
      phase: 'read',
      sources: [],
    });
  });

  it('needs no search for a greeting, a refusal or a failure', () => {
    expect(mapTurnOf(state(turn({ route: 'greeting', status: 'streaming' })))).toMatchObject({
      phase: 'none',
    });
    expect(mapTurnOf(state(turn({ route: 'off_topic', status: 'done' })))).toMatchObject({
      phase: 'none',
    });
    expect(mapTurnOf(state(turn({ status: 'error' })))).toMatchObject({ phase: 'none' });
  });
});
