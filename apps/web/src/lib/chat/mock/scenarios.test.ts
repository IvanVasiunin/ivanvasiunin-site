// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseChatEvent } from '../../sse/parse';
import { BRAINROCKET_ANSWER, mockScenario, toSse, tokenize } from './scenarios';

const streamOf = (question: string) => {
  const scenario = mockScenario(question);
  if (scenario.kind !== 'stream') throw new Error(`"${question}" is not a stream scenario`);
  return scenario.steps.map((step) => step.event);
};

describe('mockScenario', () => {
  it.each([
    'What did Ivan do at BrainRocket?',
    'hello',
    'Did Ivan work at Google?',
    'fail',
    'markdown',
  ])('streams only events that pass the contract guard (%s)', (question) => {
    for (const event of streamOf(question)) {
      const data = toSse(event)
        .replace(/^data: /, '')
        .trimEnd();
      expect(parseChatEvent(data)).toEqual(event);
    }
  });

  it('follows the about_ivan order: route → sources → token* → usage → done', () => {
    const types = streamOf('What did Ivan do at BrainRocket?').map((event) => event.type);

    expect(types[0]).toBe('route');
    expect(types[1]).toBe('sources');
    expect(types.slice(2, -2).every((type) => type === 'token')).toBe(true);
    expect(types.slice(-2)).toEqual(['usage', 'done']);
  });

  it('sends a templated greeting without sources', () => {
    const types = streamOf('Hello!').map((event) => event.type);

    expect(types).not.toContain('sources');
    expect(types.at(-1)).toBe('done');
  });

  it('ends a failing stream with an error and no done', () => {
    const types = streamOf('Make it fail').map((event) => event.type);

    expect(types.at(-1)).toBe('error');
    expect(types).not.toContain('done');
  });

  it('answers a rate limit before any stream', () => {
    expect(mockScenario('Test the limit')).toMatchObject({
      kind: 'http-error',
      status: 429,
      body: { error: { code: 'rate_limited', retry_after_s: 30 } },
    });
  });
});

describe('tokenize', () => {
  it('splits into word tokens that join back into the text', () => {
    const pieces = tokenize(BRAINROCKET_ANSWER);

    expect(pieces.length).toBeGreaterThan(20);
    expect(pieces.join('')).toBe(BRAINROCKET_ANSWER);
  });
});
