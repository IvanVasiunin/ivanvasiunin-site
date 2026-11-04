// Server-Sent Events for the chat stream (SPEC §4.1, §4.2): the wire framing and the event guard.
//
// The chat is a POST, so the browser's EventSource (GET only) cannot read it; the client reads the
// response body itself (client.ts) and this module turns the text into events. Framing follows the
// HTML spec's "event stream interpretation": lines end in LF, CR or CRLF; `data:` lines of one event
// are joined with LF; a blank line dispatches the event; `:` lines are comments (keep-alive pings);
// `event:`, `id:` and `retry:` are not used by this contract (clients dispatch on `data.type`).
import type { ChatEvent, ErrorCode, SourceItem } from '../api/types';

/** Feeds decoded text chunks in; calls `onData` with the `data` of every complete event. */
export interface SseParser {
  push(chunk: string): void;
  /** The stream ended: an event without its closing blank line is dropped, as the spec says. */
  end(): void;
}

export function createSseParser(onData: (data: string) => void): SseParser {
  let buffer = '';
  let dataLines: string[] = [];
  // A chunk may end between the CR and the LF of one CRLF; the LF must then not end a second line.
  let skipLeadingLf = false;

  const dispatch = (): void => {
    if (dataLines.length > 0) onData(dataLines.join('\n'));
    dataLines = [];
  };

  const processLine = (line: string): void => {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    // One optional space after the colon belongs to the syntax, not to the value.
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  };

  return {
    push(chunk) {
      buffer += chunk;
      if (skipLeadingLf && buffer.startsWith('\n')) buffer = buffer.slice(1);
      skipLeadingLf = false;
      for (;;) {
        const end = buffer.search(/[\r\n]/);
        if (end === -1) break;
        processLine(buffer.slice(0, end));
        const isCr = buffer[end] === '\r';
        if (isCr && end + 1 === buffer.length) {
          // A CR at the very end of the chunk: its LF, if any, arrives with the next chunk.
          buffer = '';
          skipLeadingLf = true;
          break;
        }
        const width = isCr && buffer[end + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(end + width);
      }
    },
    end() {
      buffer = '';
      dataLines = [];
    },
  };
}

// ── The event guard ────────────────────────────────────────────────────────────────────────────
// The stream is untrusted input (typescript.md): every event is checked against the contract before
// the UI sees it. A hand-written guard instead of Zod: the shapes are small, and it keeps a schema
// library out of the chat island's bundle. The types come from the generated contract, so a change
// of a field's type in the API fails the typecheck here.

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isOptional = (value: unknown, guard: (v: unknown) => boolean): boolean =>
  value === undefined || value === null || guard(value);

const ROUTES = ['about_ivan', 'greeting', 'off_topic', 'injection'] as const;
const SOURCE_TYPES = ['cv', 'experience', 'personal', 'site_docs', 'github_readme'] as const;
const FINISH_REASONS = ['stop', 'length', 'templated', 'no_info'] as const;
const ERROR_CODES = [
  'invalid_request',
  'not_found',
  'input_too_long',
  'rate_limited',
  'session_limit',
  'budget_exceeded',
  'upstream_unavailable',
  'timeout',
  'internal',
] as const satisfies readonly ErrorCode[];

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  isString(value) && (values as readonly string[]).includes(value);

/** Whether `value` is a known error code (also used for errors returned before a stream). */
export const isErrorCode = (value: unknown): value is ErrorCode => isOneOf(ERROR_CODES, value);

const numberOrNull = (value: unknown): number | null => (isNumber(value) ? value : null);
const stringOrNull = (value: unknown): string | null => (isString(value) ? value : null);

/**
 * A source link the UI may render: a path on this site, or an http(s) URL (a public README).
 * Anything else (another scheme, a protocol-relative `//host`) is dropped to null.
 */
function safeUrl(value: unknown): string | null {
  if (!isString(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

/** One retrieved source, copied field by field (so extra fields never reach the UI). */
function toSourceItem(value: unknown): SourceItem | null {
  if (
    !isObject(value) ||
    !isString(value.chunk_id) ||
    !isNumber(value.score) ||
    value.score < 0 ||
    value.score > 1 ||
    !isOneOf(SOURCE_TYPES, value.source_type) ||
    !isString(value.title) ||
    !isOptional(value.section, isString) ||
    !isOptional(value.url, isString) ||
    !isString(value.snippet)
  ) {
    return null;
  }
  return {
    chunk_id: value.chunk_id,
    score: value.score,
    source_type: value.source_type,
    title: value.title,
    section: stringOrNull(value.section),
    url: safeUrl(value.url),
    snippet: value.snippet,
  };
}

type NodeUsage = Extract<ChatEvent, { type: 'usage' }>['nodes'][number];

/** One graph step's usage; a malformed node is dropped instead of failing the whole answer. */
function toNodeUsage(value: unknown): NodeUsage | null {
  if (!isObject(value) || !isString(value.name) || !isNumber(value.ms)) return null;
  return {
    name: value.name,
    ms: value.ms,
    model: stringOrNull(value.model),
    input_tokens: numberOrNull(value.input_tokens),
    cached_input_tokens: numberOrNull(value.cached_input_tokens),
    output_tokens: numberOrNull(value.output_tokens),
    embedding_tokens: numberOrNull(value.embedding_tokens),
  };
}

/**
 * Parses one event's `data` into a `ChatEvent`, or returns null if it is not valid JSON or does not
 * match the contract. Unknown extra fields are dropped: the UI only ever sees the contract's fields.
 */
export function parseChatEvent(data: string): ChatEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(raw) || !isString(raw.type)) return null;

  switch (raw.type) {
    case 'route':
      return isOneOf(ROUTES, raw.route) && isString(raw.language)
        ? { type: 'route', route: raw.route, language: raw.language }
        : null;
    case 'sources': {
      // One malformed source fails the event: a partial list would misreport what was retrieved.
      if (!Array.isArray(raw.items)) return null;
      const items = raw.items.map(toSourceItem);
      return items.every((item) => item !== null) ? { type: 'sources', items } : null;
    }
    case 'token':
      return isString(raw.text) ? { type: 'token', text: raw.text } : null;
    case 'usage':
      return Array.isArray(raw.nodes) && isNumber(raw.total_ms) && isNumber(raw.estimated_cost_usd)
        ? {
            type: 'usage',
            nodes: raw.nodes.map(toNodeUsage).filter((node) => node !== null),
            total_ms: raw.total_ms,
            estimated_cost_usd: raw.estimated_cost_usd,
          }
        : null;
    case 'done':
      return isString(raw.message_id) && isOneOf(FINISH_REASONS, raw.finish_reason)
        ? { type: 'done', message_id: raw.message_id, finish_reason: raw.finish_reason }
        : null;
    case 'error':
      return isErrorCode(raw.code) && isString(raw.message)
        ? {
            type: 'error',
            code: raw.code,
            message: raw.message,
            retry_after_s: numberOrNull(raw.retry_after_s),
          }
        : null;
    default:
      return null;
  }
}
