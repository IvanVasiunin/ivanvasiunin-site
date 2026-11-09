// The chat client: POSTs a question to `/api/chat` and yields the answer's events (SPEC §4).
//
// Every failure becomes an `error` event, so the UI handles one stream of events and never a thrown
// exception: an HTTP error before the stream (SPEC §4.3), an unreachable API, a malformed event, or
// a stream that ends without `done`. Aborting (Stop, unmount) ends the iteration silently: "Stopped"
// is a client-side state, not a server event.
import type { ChatEvent, ChatRequest, ErrorCode } from '../api/types';
import { createSseParser, isErrorCode, parseChatEvent } from './parse';

export const CHAT_ENDPOINT = '/api/chat';

type ErrorEvent = Extract<ChatEvent, { type: 'error' }>;

export interface StreamChatOptions {
  readonly signal: AbortSignal;
  /** Injected in tests; the browser's `fetch` otherwise. */
  readonly fetchImpl?: typeof fetch;
  readonly endpoint?: string;
}

/** A client-made error event. The message is a fallback: the UI shows its own text per code. */
const errorEvent = (
  code: ErrorCode,
  message: string,
  retryAfterS: number | null = null,
): ErrorEvent => ({
  type: 'error',
  code,
  message,
  retry_after_s: retryAfterS,
});

const isAbort = (error: unknown, signal: AbortSignal): boolean =>
  signal.aborted || (error instanceof DOMException && error.name === 'AbortError');

/** `Retry-After` in seconds (the API sends seconds, never an HTTP date). */
function retryAfterHeader(response: Response): number | null {
  const value = Number(response.headers.get('Retry-After'));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/** The unified error body of a non-2xx response (SPEC §4.3), or a generic error by status. */
async function errorFromResponse(response: Response): Promise<ErrorEvent> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (a proxy's HTML error page, for one): fall back to the status below.
  }
  const error =
    typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
  if (typeof error === 'object' && error !== null && 'code' in error && isErrorCode(error.code)) {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
    const retry =
      'retry_after_s' in error && typeof error.retry_after_s === 'number'
        ? error.retry_after_s
        : retryAfterHeader(response);
    return errorEvent(error.code, message, retry);
  }
  if (response.status === 429) {
    return errorEvent('rate_limited', 'Too many requests.', retryAfterHeader(response));
  }
  if (response.status >= 500) return errorEvent('upstream_unavailable', 'The API is unavailable.');
  return errorEvent('internal', 'Unexpected response.');
}

/**
 * Streams one answer. Yields the events in arrival order and ends after `done` or `error`. The
 * caller aborts through `signal`; then the iteration ends without yielding anything more.
 */
export async function* streamChat(
  request: ChatRequest,
  { signal, fetchImpl = fetch, endpoint = CHAT_ENDPOINT }: StreamChatOptions,
): AsyncGenerator<ChatEvent, void, undefined> {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (isAbort(error, signal)) return;
    yield errorEvent('upstream_unavailable', 'The API could not be reached.');
    return;
  }

  if (!response.ok) {
    const event = await errorFromResponse(response);
    if (!signal.aborted) yield event;
    return;
  }
  const isEventStream = response.headers.get('Content-Type')?.startsWith('text/event-stream');
  if (!isEventStream || response.body === null) {
    yield errorEvent('internal', 'The API did not return an event stream.');
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const pending: string[] = [];
  const parser = createSseParser((data) => pending.push(data));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(value);
      while (pending.length > 0) {
        const event = parseChatEvent(pending.shift() ?? '');
        if (signal.aborted) return;
        if (event === null) {
          yield errorEvent('internal', 'The answer could not be read.');
          return;
        }
        yield event;
        if (event.type === 'done' || event.type === 'error') return;
      }
    }
    parser.end();
    if (!signal.aborted) yield errorEvent('internal', 'The answer ended unexpectedly.');
  } catch (error) {
    if (isAbort(error, signal)) return;
    yield errorEvent('upstream_unavailable', 'The connection was lost.');
  } finally {
    // Stops the download when the consumer stops early (done, Stop, unmount); a no-op otherwise.
    reader.cancel().catch(() => undefined);
  }
}
