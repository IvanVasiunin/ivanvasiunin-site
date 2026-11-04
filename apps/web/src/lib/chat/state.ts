// The chat's state: a list of turns (a question and its answer), changed only by `chatReducer`.
//
// Pure logic, no React: the island (islands/Chat) dispatches actions from the UI and from the event
// stream, and the tests drive the same reducer without rendering anything.
import type { ChatEvent, ChatTurn, ErrorCode, SourceItem } from '../api/types';

/** Questions longer than this are blocked in the input (SPEC US-A13; the API's default limit). */
export const MAX_QUESTION_CHARS = 500;
/** The live counter appears from this length on, near the limit. */
export const COUNTER_FROM_CHARS = 400;
/** Completed turns sent back as `history` (SPEC §4.1, the API's default). */
export const HISTORY_TURNS = 6;

type Route = Extract<ChatEvent, { type: 'route' }>['route'];
type FinishReason = Extract<ChatEvent, { type: 'done' }>['finish_reason'];

/**
 * Where an answer is before its first token, shown by the "thinking" steps. Each step follows a real
 * event: `route` ends understanding, `sources` ends the search. Templated answers (greeting, refusals)
 * skip the search.
 */
export type Step = 'understanding' | 'searching' | 'writing';

/**
 * - `pending`: sent, no token yet (the steps are shown);
 * - `streaming`: tokens are arriving;
 * - `done` / `stopped` / `error`: final until a retry.
 */
export type TurnStatus = 'pending' | 'streaming' | 'done' | 'stopped' | 'error';

export interface TurnError {
  readonly code: ErrorCode;
  readonly retryAfterS: number | null;
}

export interface Turn {
  readonly id: string;
  readonly question: string;
  /** The answer's Markdown so far. */
  readonly answer: string;
  readonly status: TurnStatus;
  readonly step: Step;
  readonly route: Route | null;
  readonly sources: readonly SourceItem[];
  readonly error: TurnError | null;
  readonly finishReason: FinishReason | null;
}

export interface ChatState {
  readonly turns: readonly Turn[];
}

export type ChatAction =
  | { readonly type: 'send'; readonly id: string; readonly question: string }
  | { readonly type: 'event'; readonly id: string; readonly event: ChatEvent }
  | { readonly type: 'stop'; readonly id: string }
  | { readonly type: 'retry'; readonly id: string };

export const INITIAL_CHAT_STATE: ChatState = { turns: [] };

const newTurn = (id: string, question: string): Turn => ({
  id,
  question,
  answer: '',
  status: 'pending',
  step: 'understanding',
  route: null,
  sources: [],
  error: null,
  finishReason: null,
});

/** Whether the turn still receives events (Send is Stop while any turn does). */
export const isActive = (turn: Turn): boolean =>
  turn.status === 'pending' || turn.status === 'streaming';

export const lastTurn = (state: ChatState): Turn | undefined => state.turns.at(-1);

export const isBusy = (state: ChatState): boolean => {
  const last = lastTurn(state);
  return last !== undefined && isActive(last);
};

/** Retry is offered on the last turn once it has ended, whatever the outcome (SPEC US-A3). */
export const canRetry = (state: ChatState, id: string): boolean => {
  const last = lastTurn(state);
  return last?.id === id && !isActive(last);
};

function applyEvent(turn: Turn, event: ChatEvent): Turn {
  switch (event.type) {
    case 'route':
      return {
        ...turn,
        route: event.route,
        step: event.route === 'about_ivan' ? 'searching' : 'writing',
      };
    case 'sources':
      return { ...turn, sources: event.items, step: 'writing' };
    case 'token':
      return { ...turn, answer: turn.answer + event.text, status: 'streaming' };
    case 'usage':
      // Shown by Under the hood (ROADMAP 5.x); nothing in the chat itself depends on it.
      return turn;
    case 'done':
      return { ...turn, status: 'done', finishReason: event.finish_reason };
    case 'error':
      return {
        ...turn,
        status: 'error',
        error: { code: event.code, retryAfterS: event.retry_after_s },
      };
    default: {
      const unknown: never = event;
      return unknown;
    }
  }
}

const updateTurn = (state: ChatState, id: string, update: (turn: Turn) => Turn): ChatState => ({
  turns: state.turns.map((turn) => (turn.id === id ? update(turn) : turn)),
});

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send':
      // One answer at a time: the UI disables Send while busy, this guards against a double submit.
      if (isBusy(state)) return state;
      return { turns: [...state.turns, newTurn(action.id, action.question)] };
    case 'event':
      // Events for a stopped turn may still be in flight; they are ignored.
      return updateTurn(state, action.id, (turn) =>
        isActive(turn) ? applyEvent(turn, action.event) : turn,
      );
    case 'stop':
      return updateTurn(state, action.id, (turn) =>
        isActive(turn) ? { ...turn, status: 'stopped' } : turn,
      );
    case 'retry':
      // Retry replaces the answer to the same question instead of adding a turn (SPEC US-A3).
      if (!canRetry(state, action.id)) return state;
      return updateTurn(state, action.id, (turn) => newTurn(turn.id, turn.question));
    default: {
      const unknown: never = action;
      return unknown;
    }
  }
}

/**
 * The `history` sent with the turn `id`: the completed turns before it, oldest first, at most
 * `HISTORY_TURNS`. Stopped and failed answers are left out: they are not answers the model gave.
 */
export function historyBefore(state: ChatState, id: string): ChatTurn[] {
  const index = state.turns.findIndex((turn) => turn.id === id);
  const earlier = index === -1 ? state.turns : state.turns.slice(0, index);
  return earlier
    .filter((turn) => turn.status === 'done')
    .slice(-HISTORY_TURNS)
    .flatMap((turn): ChatTurn[] => [
      { role: 'user', content: turn.question },
      { role: 'assistant', content: turn.answer },
    ]);
}
