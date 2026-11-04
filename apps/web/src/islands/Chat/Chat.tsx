// The chat island of AI mode (`/`, ROADMAP 3.9): Elio's introduction, the conversation and the docked
// input. Hydrated with `client:load`; its server HTML is the no-JS page (the introduction, the example
// questions as `/?q=` links, a disabled input and a pointer to the CV).
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { ChatComposer } from '../../components/ChatComposer';
import { ChatTurn } from '../../components/ChatTurn';
import { errorText } from '../../lib/chat/messages';
import { questionFromSearch } from '../../lib/chat/prefill';
import { type Turn, canRetry, lastTurn } from '../../lib/chat/state';
import { markdownToPlainText } from '../../lib/chat/text';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { type UseChatOptions, useChat } from './useChat';
import { useFollowScroll } from './useFollowScroll';
import { useKeyboardInset } from './useKeyboardInset';
import { usePageReady } from './usePageReady';

import './Chat.scss';

/** Three example questions under the input (SPEC US-A5). */
export const EXAMPLE_QUESTIONS: readonly string[] = [
  'What did Ivan do at BrainRocket?',
  'Which technologies does Ivan use?',
  'How is this site’s RAG built?',
];

/** An example's link without JS: the page with the question prefilled (SPEC §2). */
export const exampleHref = (question: string): string => `/?q=${encodeURIComponent(question)}`;

export interface ChatProps extends UseChatOptions {
  /** The "Read the CV" button: static Astro markup passed as the named slot `cv` (index.astro). */
  readonly cv?: ReactNode;
}

const NBSP = String.fromCharCode(0xa0);

/** What the live region says when an answer ends: the whole answer once, or the outcome. */
function endAnnouncement(turn: Turn): string | null {
  switch (turn.status) {
    case 'done':
      return `Elio: ${markdownToPlainText(turn.answer)}`;
    case 'stopped':
      return 'Stopped';
    case 'error': {
      if (turn.error === null) return null;
      const { title, hint } = errorText(turn.error.code, turn.error.retryAfterS);
      return `${title} ${hint}`;
    }
    case 'pending':
    case 'streaming':
      return null;
    default: {
      const unknown: never = turn.status;
      return unknown;
    }
  }
}

function Intro({ cv }: { readonly cv: ReactNode }) {
  return (
    <header className="chat__intro">
      <h1 className="chat__title">Ask Elio about Ivan’s work</h1>
      <p className="chat__lede">
        Elio is an AI assistant that answers questions about Ivan Vasiunin: his experience, skills
        and projects. It speaks about Ivan in the third person and answers only from what Ivan has
        written.
      </p>
      {cv !== undefined && <div className="chat__cv">{cv}</div>}
    </header>
  );
}

function ChatView({ cv, ...options }: ChatProps) {
  const { state, busy, send, stop, retry } = useChat(options);
  const ready = usePageReady();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useKeyboardInset(inputRef);

  // The live region (html-a11y.md → Live regions): tokens are never announced; the finished answer,
  // "Stopped", errors and "Copied" are. A non-breaking space toggles so that a repeated message
  // ("Copied" twice) is still a change the screen reader announces.
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((message: string) => {
    setAnnouncement((previous) => (previous === message ? `${message}${NBSP}` : message));
  }, []);

  const last = lastTurn(state);
  const { following, jumpToLatest } = useFollowScroll(
    `${String(state.turns.length)}:${String(last?.answer.length ?? 0)}:${last?.status ?? ''}`,
  );

  // Announce each answer's end once, on the change of its status.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (last === undefined) return;
    const message = endAnnouncement(last);
    const key = `${last.id}:${last.status}`;
    if (message === null) {
      announced.current = null;
      return;
    }
    if (announced.current === key) return;
    announced.current = key;
    announce(message);
  }, [last, announce]);

  // `?q=` fills the input and focuses it; it never sends (SPEC US-T3). Waits for `ready`: a
  // prerendered page must not take focus before anyone sees it.
  useEffect(() => {
    if (!ready) return;
    const question = questionFromSearch(window.location.search);
    if (question === null) return;
    // After the hydration render has settled, so the prefill is a normal update, not a cascade.
    const frame = requestAnimationFrame(() => {
      setDraft(question);
      inputRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [ready]);

  const onSend = (): void => {
    send(draft);
    // One short status while the answer is prepared; the steps themselves are not announced.
    announce('Elio is preparing the answer');
    setDraft('');
    // A new question always brings the reader to it, even after scrolling up.
    jumpToLatest(false);
  };

  const onStop = (): void => {
    stop();
    // The Stop button turns back into Send, which is disabled with an empty input: keep focus usable.
    inputRef.current?.focus();
  };

  const onExample = (question: string): void => {
    setDraft(question);
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    // The caret after the text, ready for Enter or an edit (after React has written the value).
    requestAnimationFrame(() => {
      input.setSelectionRange(input.value.length, input.value.length);
    });
  };

  return (
    <div className="chat" data-state={state.turns.length === 0 ? 'empty' : 'conversation'}>
      <Intro cv={cv} />

      {state.turns.length > 0 && (
        <div className="chat__log">
          {state.turns.map((turn) => (
            <ChatTurn
              key={turn.id}
              turn={turn}
              canRetry={canRetry(state, turn.id)}
              onRetry={retry}
              onAnnounce={announce}
            />
          ))}
        </div>
      )}

      <div className="chat__dock">
        {!following && state.turns.length > 0 && (
          <button
            className="chat__jump"
            type="button"
            onClick={() => {
              jumpToLatest();
            }}
          >
            <svg
              className="chat__jump-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Jump to latest
          </button>
        )}
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={onSend}
          onStop={onStop}
          busy={busy}
          ready={ready}
          inputRef={inputRef}
        />
      </div>

      {state.turns.length === 0 && (
        <ul className="chat__examples" aria-label="Example questions">
          {EXAMPLE_QUESTIONS.map((question) => (
            <li key={question}>
              <a
                className="chat__example"
                href={exampleHref(question)}
                onClick={(event) => {
                  // A modified or middle click keeps the link's own behaviour (a new tab).
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  // With JS an example only fills the input; it never sends (SPEC US-A5).
                  event.preventDefault();
                  onExample(question);
                }}
              >
                {question}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="chat__disclosure">
        Elio is an AI assistant and can be wrong; Ivan is the source of truth.{' '}
        <a className="chat__disclosure-link" href="/privacy">
          How chats are handled
        </a>
      </p>
      <noscript>
        <p className="chat__disclosure">
          The chat needs JavaScript. <a href="/cv">Read the CV</a> instead.
        </p>
      </noscript>

      <p className="chat__status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function ChatFallback({ cv }: { readonly cv: ReactNode }) {
  return (
    <div className="chat">
      <Intro cv={cv} />
      <p className="chat__fallback">
        The chat could not start. Try reloading the page, or <a href="/cv">read the CV</a>.
      </p>
    </div>
  );
}

export function Chat(props: ChatProps) {
  return (
    <ChatErrorBoundary fallback={<ChatFallback cv={props.cv} />}>
      <ChatView {...props} />
    </ChatErrorBoundary>
  );
}
