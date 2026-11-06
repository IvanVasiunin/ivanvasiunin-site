// The conversation kept for the tab's lifetime (Ivan, 2026-11-05): switching to Text mode and back
// brings it back; closing the tab or "New chat" ends it. sessionStorage, like the session id
// (session.ts): it never leaves the browser and dies with the tab.
//
// Stored data is untrusted input (typescript.md): every field is checked on the way back, sources
// and codes through the same validators as the live event stream, and anything malformed drops the
// whole stored conversation instead of reaching the UI.
import { isErrorCode, parseChatEvent } from '../sse/parse';
import { MAX_QUESTION_CHARS, type Step, type Turn, type TurnStatus } from './state';

export const HISTORY_STORAGE_KEY = 'elio-chat-v1';
/** The oldest turns are dropped beyond this, so the stored JSON stays small. */
export const MAX_STORED_TURNS = 30;
/** A stored answer longer than this is not one the API produced (it caps output tokens). */
export const MAX_STORED_ANSWER_CHARS = 20_000;
/** A language code longer than this is not one the router returns (ISO 639-1, maybe a region). */
const MAX_LANGUAGE_CHARS = 16;

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const browserStorage = (): HistoryStorage => window.sessionStorage;

const STATUSES: readonly TurnStatus[] = ['pending', 'streaming', 'done', 'stopped', 'error'];
const STEPS: readonly Step[] = ['understanding', 'searching', 'writing'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

/** An answer interrupted by leaving the page cannot continue: it comes back as "Stopped". */
const settled = (turn: Turn): Turn =>
  turn.status === 'pending' || turn.status === 'streaming' ? { ...turn, status: 'stopped' } : turn;

/** Saves the conversation; storage that is missing or full is ignored (nothing breaks). */
export function saveTurns(turns: readonly Turn[], storage = browserStorage): void {
  try {
    if (turns.length === 0) {
      storage().removeItem(HISTORY_STORAGE_KEY);
      return;
    }
    const kept = turns.slice(-MAX_STORED_TURNS).map(settled);
    storage().setItem(HISTORY_STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Private mode, blocked site data or a full quota: the chat simply is not restored later.
  }
}

/** The stored conversation, or none when there is nothing valid to restore. */
export function loadTurns(storage = browserStorage): Turn[] {
  let raw: unknown;
  try {
    const text = storage().getItem(HISTORY_STORAGE_KEY);
    if (text === null) return [];
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw) || raw.length > MAX_STORED_TURNS) return [];
  const turns: Turn[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const turn = toTurn(item);
    // Ids key the rendered turns and label them for screen readers: a repeat is tampering.
    if (turn === null || ids.has(turn.id)) return [];
    ids.add(turn.id);
    turns.push(turn);
  }
  return turns;
}

export function clearTurns(storage = browserStorage): void {
  try {
    storage().removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Nothing stored, or storage is unavailable: nothing to clear.
  }
}

/** Rebuilds one turn field by field, or null if any field is malformed. */
function toTurn(value: unknown): Turn | null {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.question !== 'string' ||
    value.question.length > MAX_QUESTION_CHARS ||
    typeof value.answer !== 'string' ||
    value.answer.length > MAX_STORED_ANSWER_CHARS ||
    !isOneOf(STATUSES, value.status) ||
    !isOneOf(STEPS, value.step)
  ) {
    return null;
  }
  const route = value.route === null ? null : toRoute(value.route);
  const sources = toSources(value.sources);
  const error = value.error === null ? null : toError(value.error);
  const finishReason = value.finishReason === null ? null : toFinishReason(value.finishReason);
  // Turns stored before Under the hood (ROADMAP 5.2) have neither field: they come back without it.
  const language =
    value.language === undefined || value.language === null ? null : toLanguage(value.language);
  const usage = value.usage === undefined || value.usage === null ? null : toUsage(value.usage);
  if (
    route === undefined ||
    sources === null ||
    error === undefined ||
    finishReason === undefined ||
    language === undefined ||
    usage === undefined
  ) {
    return null;
  }
  return settled({
    id: value.id,
    question: value.question,
    answer: value.answer,
    status: value.status,
    step: value.step,
    route,
    language,
    sources,
    usage,
    error,
    finishReason,
  });
}

// The event validators of the live stream check the contract's values (routes, source items,
// finish reasons); a stored field is wrapped in the event that carries it and parsed the same way.
function toRoute(value: unknown): Turn['route'] | undefined {
  const event = parseChatEvent(JSON.stringify({ type: 'route', route: value, language: 'en' }));
  return event?.type === 'route' ? event.route : undefined;
}

function toSources(value: unknown): Turn['sources'] | null {
  if (!Array.isArray(value)) return null;
  // One malformed source fails the whole parse, as it does for a live `sources` event.
  const event = parseChatEvent(JSON.stringify({ type: 'sources', items: value }));
  return event?.type === 'sources' ? event.items : null;
}

function toError(value: unknown): Turn['error'] | undefined {
  if (!isObject(value) || !isErrorCode(value.code)) return undefined;
  const retryAfterS = value.retryAfterS;
  if (retryAfterS !== null && (typeof retryAfterS !== 'number' || retryAfterS < 0)) {
    return undefined;
  }
  return { code: value.code, retryAfterS };
}

function toLanguage(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_LANGUAGE_CHARS
    ? value
    : undefined;
}

function toUsage(value: unknown): Turn['usage'] | undefined {
  if (!isObject(value)) return undefined;
  // The usage event's own validator keeps only the contract's fields of every step.
  const event = parseChatEvent(JSON.stringify({ ...value, type: 'usage' }));
  return event?.type === 'usage'
    ? { nodes: event.nodes, total_ms: event.total_ms, estimated_cost_usd: event.estimated_cost_usd }
    : undefined;
}

function toFinishReason(value: unknown): Turn['finishReason'] | undefined {
  const event = parseChatEvent(
    JSON.stringify({ type: 'done', message_id: 'stored', finish_reason: value }),
  );
  return event?.type === 'done' ? event.finish_reason : undefined;
}
