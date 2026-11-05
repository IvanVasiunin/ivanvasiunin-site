// The chat's state and its connection to `/api/chat`: send, stop and retry (SPEC US-A1–A3).
//
// One AbortController per answer. Stop aborts it and marks the turn "Stopped" at once (the partial
// answer stays); unmount aborts too. Events are dispatched only while the controller is not aborted,
// so nothing updates the state after Stop or unmount (react.md → Effects and streaming).
//
// The conversation lives as long as the tab (lib/chat/history.ts): restored after the page loads,
// saved whenever an answer ends and when the page is left, cleared by "New chat".
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { clearTurns, loadTurns, saveTurns } from '../../lib/chat/history';

import {
  type ChatState,
  INITIAL_CHAT_STATE,
  canRetry,
  chatReducer,
  historyBefore,
  isBusy,
  lastTurn,
} from '../../lib/chat/state';
import { sessionId } from '../../lib/chat/session';
import { type StreamChatOptions, streamChat } from '../../lib/sse/client';

export interface UseChatOptions {
  /** Injected in tests; the browser's `fetch` otherwise. */
  readonly fetchImpl?: StreamChatOptions['fetchImpl'];
  /** Injected in tests; a random UUID otherwise. */
  readonly newTurnId?: () => string;
  /** Injected in tests; the tab's sessionStorage otherwise. */
  readonly historyStorage?: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export interface UseChat {
  readonly state: ChatState;
  readonly busy: boolean;
  /** Sends a question; ignored while an answer is streaming or for blank text. */
  readonly send: (question: string) => void;
  readonly stop: () => void;
  readonly retry: (turnId: string) => void;
  /** "New chat": stops any answer and forgets the conversation, here and in storage. */
  readonly clear: () => void;
}

const randomTurnId = (): string => crypto.randomUUID();

/** Whether a view transition is running; false where the selector is unknown (no transitions). */
function viewTransitionActive(): boolean {
  try {
    return document.documentElement.matches(':active-view-transition');
  } catch {
    return false;
  }
}

/** At ~60 fps about two seconds: far longer than the mode switch's transition. */
const MAX_TRANSITION_FRAMES = 120;

/**
 * Runs `run` once no view transition is animating (checked each frame), or after
 * MAX_TRANSITION_FRAMES in case one never reports its end; returns a cancel.
 */
export function afterViewTransition(run: () => void): () => void {
  let frame = 0;
  let frames = 0;
  const check = (): void => {
    if (viewTransitionActive() && frames < MAX_TRANSITION_FRAMES) {
      frames += 1;
      frame = requestAnimationFrame(check);
      return;
    }
    run();
  };
  check();
  return () => {
    cancelAnimationFrame(frame);
  };
}

const sessionHistory = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =>
  window.sessionStorage;

export function useChat({
  fetchImpl,
  newTurnId = randomTurnId,
  historyStorage = sessionHistory,
}: UseChatOptions = {}): UseChat {
  // Starts empty, as on the server: reading storage here would make the hydrated HTML differ.
  const [state, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  // The latest committed state for the callbacks below, without making them change on every token.
  // Updated after commit, not during render (refs must not be written while rendering).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  // Restore once, after hydration and after the mode switch's view transition has finished.
  // Inserting the restored conversation while the cross-document transition animates crashes
  // WebKit (found by e2e on the iPhone profile, 2026-11-05); the page looks the same either way.
  useEffect(() => {
    const turns = loadTurns(historyStorage);
    if (turns.length === 0) return;
    return afterViewTransition(() => {
      dispatch({ type: 'restore', turns });
    });
  }, [historyStorage]);

  // Save when nothing is streaming (an answer ended, was stopped or failed; a restore), so storage
  // is not rewritten on every token. An empty chat saves nothing: on mount it would erase the stored
  // conversation before the restore above lands; "New chat" erases it explicitly (clear below).
  const busy = isBusy(state);
  useEffect(() => {
    if (!busy && state.turns.length > 0) saveTurns(state.turns, historyStorage);
  }, [busy, state.turns, historyStorage]);

  // Leaving mid-answer (the mode switch, a link): keep what has arrived; it comes back as Stopped.
  useEffect(() => {
    const onPageHide = (): void => {
      if (stateRef.current.turns.length > 0) saveTurns(stateRef.current.turns, historyStorage);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [historyStorage]);

  const stream = useCallback(
    (turnId: string, question: string, history: ReturnType<typeof historyBefore>) => {
      // One stream at a time: a stream still running (a double submit in one tick) is aborted.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const request = { message: question, session_id: sessionId(), history };
      const run = async (): Promise<void> => {
        const options =
          fetchImpl === undefined
            ? { signal: controller.signal }
            : { signal: controller.signal, fetchImpl };
        for await (const event of streamChat(request, options)) {
          if (controller.signal.aborted) return;
          dispatch({ type: 'event', id: turnId, event });
        }
      };
      // streamChat turns every failure into an error event, so this never rejects in practice; the
      // catch keeps an unexpected bug from becoming an unhandled rejection.
      run().catch(() => {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'event',
            id: turnId,
            event: { type: 'error', code: 'internal', message: '', retry_after_s: null },
          });
        }
      });
    },
    [fetchImpl],
  );

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      if (question === '' || isBusy(stateRef.current)) return;
      const id = newTurnId();
      const history = historyBefore(stateRef.current, id);
      dispatch({ type: 'send', id, question });
      stream(id, question, history);
    },
    [newTurnId, stream],
  );

  const stop = useCallback(() => {
    const turn = lastTurn(stateRef.current);
    controllerRef.current?.abort();
    if (turn !== undefined) dispatch({ type: 'stop', id: turn.id });
  }, []);

  const retry = useCallback(
    (turnId: string) => {
      const current = stateRef.current;
      const turn = lastTurn(current);
      if (turn?.id !== turnId || !canRetry(current, turnId)) return;
      dispatch({ type: 'retry', id: turnId });
      stream(turnId, turn.question, historyBefore(current, turnId));
    },
    [stream],
  );

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    dispatch({ type: 'clear' });
    clearTurns(historyStorage);
  }, [historyStorage]);

  return { state, busy, send, stop, retry, clear };
}
