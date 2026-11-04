// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createSseParser, isErrorCode, parseChatEvent } from './parse';

function collect(chunks: readonly string[]): string[] {
  const data: string[] = [];
  const parser = createSseParser((value) => data.push(value));
  for (const chunk of chunks) parser.push(chunk);
  parser.end();
  return data;
}

describe('createSseParser', () => {
  it('dispatches one event per blank line', () => {
    expect(collect(['data: {"a":1}\n\ndata: {"b":2}\n\n'])).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('joins an event that arrives split across chunks, even mid-line', () => {
    expect(collect(['da', 'ta: {"type":', '"token"}', '\n', '\n'])).toEqual(['{"type":"token"}']);
  });

  it.each([
    ['CRLF', 'data: x\r\n\r\n'],
    ['CR', 'data: x\r\r'],
    ['LF', 'data: x\n\n'],
  ])('accepts %s line endings', (_name, stream) => {
    expect(collect([stream])).toEqual(['x']);
  });

  it('treats a CRLF split between two chunks as one line ending', () => {
    expect(collect(['data: x\r', '\n\r', '\ndata: y\r\n\r\n'])).toEqual(['x', 'y']);
  });

  it('joins multi-line data with a line feed', () => {
    expect(collect(['data: one\ndata: two\n\n'])).toEqual(['one\ntwo']);
  });

  it('removes only one space after the colon', () => {
    expect(collect(['data:  two spaces\ndata:none\n\n'])).toEqual([' two spaces\nnone']);
  });

  it('ignores comments, other fields and empty events', () => {
    expect(collect([': ping\n\nevent: x\nid: 1\nretry: 5\n\ndata: y\n\n'])).toEqual(['y']);
  });

  it('drops an unfinished event when the stream ends', () => {
    expect(collect(['data: complete\n\ndata: cut'])).toEqual(['complete']);
  });
});

describe('parseChatEvent', () => {
  const source = {
    chunk_id: 'cv:brainrocket:3',
    score: 0.83,
    source_type: 'cv',
    title: 'BrainRocket — Senior Markup Developer',
    section: 'Key stories',
    url: '/cv#brainrocket',
    snippet: 'Traced a homepage performance problem to CSS masks…',
  };

  it.each([
    [{ type: 'route', route: 'about_ivan', language: 'en' }],
    [{ type: 'sources', items: [source] }],
    [{ type: 'sources', items: [] }],
    [{ type: 'token', text: 'Ivan ' }],
    [{ type: 'done', message_id: 'b2e0', finish_reason: 'stop' }],
    [{ type: 'error', code: 'rate_limited', message: 'Too many.', retry_after_s: 30 }],
  ])('accepts the SPEC example %o', (event) => {
    expect(parseChatEvent(JSON.stringify(event))).toEqual(event);
  });

  it('normalises usage nodes and drops malformed ones', () => {
    const event = {
      type: 'usage',
      nodes: [{ name: 'retrieval', ms: 120, embedding_tokens: 9 }, { name: 'broken' }],
      total_ms: 2273,
      estimated_cost_usd: 0.0061,
    };

    expect(parseChatEvent(JSON.stringify(event))).toEqual({
      ...event,
      nodes: [
        {
          name: 'retrieval',
          ms: 120,
          model: null,
          input_tokens: null,
          cached_input_tokens: null,
          output_tokens: null,
          embedding_tokens: 9,
        },
      ],
    });
  });

  it('drops fields that are not in the contract', () => {
    const parsed = parseChatEvent(
      JSON.stringify({ type: 'sources', items: [{ ...source, system_prompt: 'x' }], extra: 1 }),
    );

    expect(parsed).toEqual({ type: 'sources', items: [source] });
  });

  it.each([
    ['javascript:alert(1)', null],
    ['data:text/html,x', null],
    ['//evil.example', null],
    ['/cv#job-brainrocket', '/cv#job-brainrocket'],
    ['https://github.com/ivan/repo', 'https://github.com/ivan/repo'],
  ])('keeps only safe source links: %s → %s', (url, expected) => {
    const parsed = parseChatEvent(JSON.stringify({ type: 'sources', items: [{ ...source, url }] }));

    expect(parsed).toEqual({ type: 'sources', items: [{ ...source, url: expected }] });
  });

  it('fills a missing nullable field with null', () => {
    expect(parseChatEvent('{"type":"error","code":"timeout","message":"Slow."}')).toEqual({
      type: 'error',
      code: 'timeout',
      message: 'Slow.',
      retry_after_s: null,
    });
  });

  it.each([
    ['not JSON', 'Ivan'],
    ['an array', '[]'],
    ['an unknown type', '{"type":"thinking"}'],
    ['an unknown route', '{"type":"route","route":"weather","language":"en"}'],
    ['a token without text', '{"type":"token"}'],
    ['an unknown error code', '{"type":"error","code":"oops","message":"x"}'],
    ['an unknown finish reason', '{"type":"done","message_id":"1","finish_reason":"bored"}'],
    ['a score above 1', JSON.stringify({ type: 'sources', items: [{ ...source, score: 1.5 }] })],
    [
      'an unknown source type',
      JSON.stringify({ type: 'sources', items: [{ ...source, source_type: 'wiki' }] }),
    ],
  ])('rejects %s', (_name, data) => {
    expect(parseChatEvent(data)).toBeNull();
  });
});

describe('isErrorCode', () => {
  it('knows the codes of SPEC §4.3 and nothing else', () => {
    expect(isErrorCode('rate_limited')).toBe(true);
    expect(isErrorCode('teapot')).toBe(false);
    expect(isErrorCode(429)).toBe(false);
  });
});
