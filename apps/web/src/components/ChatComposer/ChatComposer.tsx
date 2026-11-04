// The question input (SPEC US-A1, A2, A13): a textarea with Send that becomes Stop while an answer
// streams, and a counter near the length limit. The chat docks it at the bottom of the screen.
//
// Keyboard: Enter sends, Shift+Enter inserts a line break, and Enter during IME composition (Japanese,
// Chinese input) never sends. The textarea stays editable while an answer streams, so the next
// question can be drafted; only sending waits.
import {
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type SyntheticEvent,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';

import { COUNTER_FROM_CHARS, MAX_QUESTION_CHARS } from '../../lib/chat/state';

import './ChatComposer.scss';

export interface ChatComposerProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  /** An answer is streaming: the button is Stop. */
  readonly busy: boolean;
  /** Hydrated and visible; before that (server HTML, no JS) the input is disabled. */
  readonly ready: boolean;
  /** The textarea, owned by the chat (it focuses the input for examples and `?q=`). */
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
}

// An Enter this soon after an IME composition ended belongs to it (Safari), not to sending (ms).
const COMPOSITION_GRACE_MS = 50;

function SendIcon() {
  return (
    <svg className="chat-composer__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="chat-composer__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect
        className="chat-composer__stop-square"
        x="6.5"
        y="6.5"
        width="11"
        height="11"
        rx="2.5"
      />
    </svg>
  );
}

// Grows the textarea with its text where CSS `field-sizing` is missing (the CSS caps the height).
function useAutoGrow(textarea: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const element = textarea.current;
    if (element === null || CSS.supports('field-sizing', 'content')) return;
    element.style.setProperty('--chat-composer-height', 'auto');
    element.style.setProperty('--chat-composer-height', `${String(element.scrollHeight)}px`);
  }, [textarea, value]);
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  ready,
  inputRef,
}: ChatComposerProps) {
  const id = useId();
  useAutoGrow(inputRef, value);
  // When the last IME composition ended (ms, event time). Safari fires `compositionend` before the
  // Enter that confirms it, and that Enter no longer reports `isComposing`.
  const compositionEnd = useRef(Number.NEGATIVE_INFINITY);

  const blank = value.trim() === '';
  const showCounter = value.length >= COUNTER_FROM_CHARS;
  const counterId = `${id}-counter`;

  // A tap on Send / Stop must not move focus off the input: on a phone that would close the keyboard.
  // The click still fires; only the focus change on press is cancelled.
  const keepInputFocus = (event: MouseEvent<HTMLButtonElement>): void => {
    if (document.activeElement === inputRef.current) event.preventDefault();
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!busy && !blank) onSend();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const composing =
      event.nativeEvent.isComposing ||
      event.timeStamp - compositionEnd.current < COMPOSITION_GRACE_MS;
    if (event.key !== 'Enter' || event.shiftKey || composing) return;
    event.preventDefault();
    if (!busy && !blank) onSend();
  };

  return (
    <form className="chat-composer" onSubmit={submit} aria-label="Ask Elio">
      <div className="chat-composer__field" data-disabled={ready ? undefined : ''}>
        <label className="chat-composer__label" htmlFor={`${id}-input`}>
          Ask Elio about Ivan
        </label>
        <textarea
          ref={inputRef}
          id={`${id}-input`}
          className="chat-composer__input"
          name="message"
          rows={1}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="Ask about Ivan’s work"
          enterKeyHint="send"
          autoComplete="off"
          value={value}
          disabled={!ready}
          aria-describedby={showCounter ? counterId : undefined}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onCompositionEnd={(event) => {
            compositionEnd.current = event.timeStamp;
          }}
        />
        {busy ? (
          <button
            className="chat-composer__button"
            type="button"
            data-action="stop"
            onMouseDown={keepInputFocus}
            onClick={onStop}
          >
            <StopIcon />
            <span className="chat-composer__button-label">Stop</span>
          </button>
        ) : (
          <button
            className="chat-composer__button"
            type="submit"
            data-action="send"
            // Blank text: aria-disabled, not disabled, so a focused button keeps focus when Stop
            // turns back into Send at the end of an answer. Before hydration it is truly disabled.
            disabled={!ready}
            aria-disabled={blank ? true : undefined}
            onMouseDown={keepInputFocus}
          >
            <SendIcon />
            <span className="chat-composer__button-label">Send</span>
          </button>
        )}
      </div>

      {showCounter && (
        <p
          className="chat-composer__counter"
          id={counterId}
          data-state={value.length >= MAX_QUESTION_CHARS ? 'limit' : undefined}
        >
          {`${String(value.length)} / ${String(MAX_QUESTION_CHARS)} characters`}
        </p>
      )}
    </form>
  );
}
