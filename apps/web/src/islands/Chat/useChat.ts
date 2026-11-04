// The chat's state and its connection to `/api/chat`: send, stop and retry (SPEC US-A1–A3).
//
// One AbortController per answer. Stop aborts it and marks the turn "Stopped" at once (the partial
// answer stays); unmount aborts too. Events are dispatched only while the controller is not aborted,
// so nothing updates the state after Stop or unmount (react.md → Effects and streaming).
import { useCallback, useEffect, useReducer, useRef } from 'react';

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
}

export interface UseChat {
  readonly state: ChatState;
  readonly busy: boolean;
  /** Sends a question; ignored while an answer is streaming or for blank text. */
  readonly send: (question: string) => void;
  readonly stop: () => void;
  readonly retry: (turnId: string) => void;
}

const randomTurnId = (): string => crypto.randomUUID();

export function useChat({ fetchImpl, newTurnId = randomTurnId }: UseChatOptions = {}): UseChat {
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

  return { state, busy: isBusy(state), send, stop, retry };
}
