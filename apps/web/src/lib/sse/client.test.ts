// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { ChatEvent, ChatRequest } from '../api/types';
import { CHAT_ENDPOINT, streamChat } from './client';

const REQUEST: ChatRequest = {
  message: 'What did Ivan do at BrainRocket?',
  session_id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  history: [],
};

const sse = (...events: readonly object[]): string =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

/** A streaming body that delivers the given chunks one by one. */
function bodyOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const streamResponse = (chunks: readonly string[]): Response =>
  new Response(bodyOf(chunks), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });

async function collect(
  fetchImpl: typeof fetch,
  signal = new AbortController().signal,
): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of streamChat(REQUEST, { signal, fetchImpl })) events.push(event);
  return events;
}

const fetchReturning = (response: Response): typeof fetch =>
  vi.fn<typeof fetch>().mockResolvedValue(response);

const ROUTE = { type: 'route', route: 'about_ivan', language: 'en' };
const TOKEN = { type: 'token', text: 'Ivan ' };
const DONE = { type: 'done', message_id: 'b2e0', finish_reason: 'stop' };

describe('streamChat', () => {
  it('POSTs the request as JSON and asks for an event stream', async () => {
    const fetchImpl = fetchReturning(streamResponse([sse(DONE)]));

    await collect(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      CHAT_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(REQUEST),
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      }),
    );
  });

  it('yields the events in order and stops after done', async () => {
    const stream = sse(ROUTE, TOKEN, DONE) + sse({ type: 'token', text: 'after done' });

    // Split mid-event: framing is the parser's job, the client only forwards complete events.
    const events = await collect(
      fetchReturning(streamResponse([stream.slice(0, 30), stream.slice(30)])),
    );

    expect(events).toEqual([ROUTE, TOKEN, DONE]);
  });

  it('ends after an error event', async () => {
    const error = { type: 'error', code: 'timeout', message: 'Slow.', retry_after_s: null };

    const events = await collect(fetchReturning(streamResponse([sse(ROUTE, error, TOKEN)])));

    expect(events).toEqual([ROUTE, error]);
  });

  it('turns the unified error body of a failed request into an error event', async () => {
    const response = Response.json(
      { error: { code: 'rate_limited', message: 'Too many questions.', retry_after_s: 30 } },
      { status: 429, headers: { 'Retry-After': '30' } },
    );

    expect(await collect(fetchReturning(response))).toEqual([
      { type: 'error', code: 'rate_limited', message: 'Too many questions.', retry_after_s: 30 },
    ]);
  });

  it('reads Retry-After when the body has no delay', async () => {
    const response = new Response('<html>Too many</html>', {
      status: 429,
      headers: { 'Retry-After': '12' },
    });

    expect(await collect(fetchReturning(response))).toEqual([
      expect.objectContaining({ code: 'rate_limited', retry_after_s: 12 }),
    ]);
  });

  it('reports a 5xx without a body as an unavailable API', async () => {
    const events = await collect(fetchReturning(new Response('Bad gateway', { status: 502 })));

    expect(events).toEqual([expect.objectContaining({ code: 'upstream_unavailable' })]);
  });

  it('reports a network failure as an unavailable API', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await collect(fetchImpl)).toEqual([
      expect.objectContaining({ type: 'error', code: 'upstream_unavailable' }),
    ]);
  });

  it('rejects a response that is not an event stream', async () => {
    const events = await collect(fetchReturning(Response.json({ answer: 'Ivan…' })));

    expect(events).toEqual([expect.objectContaining({ code: 'internal' })]);
  });

  it('reports a malformed event and stops reading', async () => {
    const events = await collect(
      fetchReturning(streamResponse([sse(ROUTE), 'data: {oops\n\n', sse(DONE)])),
    );

    expect(events).toEqual([ROUTE, expect.objectContaining({ code: 'internal' })]);
  });

  it('reports a stream that ends without done', async () => {
    const events = await collect(fetchReturning(streamResponse([sse(ROUTE, TOKEN)])));

    expect(events).toEqual([ROUTE, TOKEN, expect.objectContaining({ code: 'internal' })]);
  });

  it('yields nothing more after an abort, and never an error for it', async () => {
    const controller = new AbortController();
    const fetchImpl = fetchReturning(streamResponse([sse(ROUTE, TOKEN, TOKEN, DONE)]));
    const events: ChatEvent[] = [];

    for await (const event of streamChat(REQUEST, { signal: controller.signal, fetchImpl })) {
      events.push(event);
      controller.abort();
    }

    expect(events).toEqual([ROUTE]);
  });

  it('ends silently when fetch rejects because of an abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    expect(await collect(fetchImpl, controller.signal)).toEqual([]);
  });
});
