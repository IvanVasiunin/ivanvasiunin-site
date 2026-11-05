// The chat island of AI mode (`/`, ROADMAP 3.9): Elio's greeting, the conversation and the docked
// input. Hydrated with `client:load`; its server HTML is the no-JS page (the greeting, the example
// questions as `/?q=` links, a disabled input and, in <noscript>, a pointer to the CV).
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatComposer } from '../../components/ChatComposer';
import { ElioAvatar } from '../../components/ElioAvatar';
import { ChatTurn } from '../../components/ChatTurn';
import { ChatWelcome } from '../../components/ChatWelcome';
import { errorText } from '../../lib/chat/messages';
import { questionFromSearch } from '../../lib/chat/prefill';
import { type Turn, canRetry, lastTurn } from '../../lib/chat/state';
import { markdownToPlainText } from '../../lib/chat/text';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { type UseChatOptions, useChat } from './useChat';
import { useFollowScroll } from './useFollowScroll';
import { useKeyboardInset } from './useKeyboardInset';
import { useScrollAnchor } from './useScrollAnchor';
import { usePageReady } from './usePageReady';

import './Chat.scss';

/** A question's link without JS: the page with the question prefilled (SPEC §2). */
export const exampleHref = (question: string): string => `/?q=${encodeURIComponent(question)}`;

export type ChatProps = UseChatOptions;

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

// Elio introduces itself in the first person; Ivan stays in the third person, as in every answer.
function Intro({ busy = false }: { readonly busy?: boolean }) {
  return (
    <header className="chat__intro">
      {/* The live avatar: its eyes follow the mouse; it shows the thinking light while busy. */}
      <ElioAvatar size="lg" live active={busy} named={false} />
      <div className="chat__intro-text">
        <h1 className="chat__title">Hi! I’m Elio, Ivan’s AI assistant.</h1>
        <p className="chat__lede">
          I can tell you about his experience, skills and projects, or how this site works. Ask me
          anything below, or pick a question to start.
        </p>
      </div>
    </header>
  );
}

function ChatView(options: ChatProps) {
  const { state, busy, send, stop, retry, clear, restored } = useChat(options);
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const { following, jumpToLatest, pause } = useFollowScroll(
    `${String(state.turns.length)}:${String(last?.answer.length ?? 0)}:${last?.status ?? ''}`,
    state.turns.length > 0,
    scrollRef,
    dockRef,
  );
  // Back from a link in an answer (the CV): the reader returns to that answer, not to the end.
  useScrollAnchor({ areaRef: scrollRef, following, pause, restored, ready });

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

  const onNewChat = (): void => {
    clear();
    announce('New chat');
    // The button disappears with the conversation: focus goes to where the next question starts.
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
    <div
      className="chat"
      data-state={state.turns.length === 0 ? 'empty' : 'conversation'}
      // The reader has scrolled up from the latest answer (text now passes behind the input).
      data-reading={following || state.turns.length === 0 ? undefined : ''}
    >
      <Intro busy={busy} />

      <div className="chat__panel">
        {/* From `md` the chat is a panel and this area scrolls inside it, above the input; below
      `md` the page scrolls (Chat.scss). */}
        <div className="chat__scroll" ref={scrollRef}>
          {state.turns.length > 0 && (
            <div className="chat__toolbar">
              <button className="chat__new" type="button" onClick={onNewChat}>
                <svg
                  className="chat__new-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New chat
              </button>
            </div>
          )}

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

          {state.turns.length === 0 && <ChatWelcome onPick={onExample} hrefFor={exampleHref} />}
        </div>

        <div className="chat__dock" ref={dockRef}>
          {/* Always mounted while there is a conversation, so it can fade in and out (Ivan:
          it vanished abruptly). Hidden, it is inert: no pointer, no Tab stop, nothing read out. */}
          {state.turns.length > 0 && (
            <button
              className="chat__jump"
              type="button"
              inert={following}
              aria-hidden={following ? true : undefined}
              onClick={() => {
                jumpToLatest();
                // The button fades away: focus moves to the latest answer (not the input, which
                // would open the keyboard on a phone), without breaking the smooth scroll.
                scrollRef.current
                  ?.querySelector<HTMLElement>('.chat-turn:last-child')
                  ?.focus({ preventScroll: true });
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
      </div>

      <p className="chat__status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function ChatFallback() {
  return (
    <div className="chat">
      <Intro />
      <p className="chat__fallback">
        The chat could not start. Try reloading the page, or <a href="/cv">read the CV</a>.
      </p>
    </div>
  );
}

export function Chat(props: ChatProps) {
  return (
    <ChatErrorBoundary fallback={<ChatFallback />}>
      <ChatView {...props} />
    </ChatErrorBoundary>
  );
}
