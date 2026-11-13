// One turn of the conversation, layout A "Logbook" (ROADMAP 3.9): the question as a log entry with a
// gradient rule, then Elio's answer in serif prose, its sources as a chart key, and the actions.
//
// The question is the turn's heading (h2), so a screen reader can jump between questions; "Sources"
// is an h3 under it.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import type { SourceItem } from '../../lib/api/types';
import { errorText } from '../../lib/chat/messages';
import { emitMapEvent, onMapEvent } from '../../lib/viz/events';
import { type Turn, isActive } from '../../lib/chat/state';
import { ChatMarkdown } from '../ChatMarkdown';
import { ElioAvatar } from '../ElioAvatar';
import { ThinkingSteps } from '../ThinkingSteps';
import { type HoodState, UnderTheHood, usageSummary } from '../UnderTheHood';

import { firstHiddenIndex } from './sourceRows';

import './ChatTurn.scss';

/**
 * A safety net only: the closing ends when the fold's own transition finishes (see the effect in
 * ChatTurn). A short timer hid the panel mid-fold on a slow machine (WebKit on CI: a 430 px jump).
 */
const CLOSING_FALLBACK_MS = 3000;

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How long "Copied" replaces "Copy" (ms). */
export const COPIED_MS = 2000;

export interface ChatTurnProps {
  readonly turn: Turn;
  /** Retry is offered (the last turn, once it has ended). */
  readonly canRetry: boolean;
  readonly onRetry: (turnId: string) => void;
  /** Speaks a short status through the chat's live region ("Copied"). */
  readonly onAnnounce: (message: string) => void;
}

const SOURCE_KIND: Readonly<Record<SourceItem['source_type'], string>> = {
  cv: 'CV',
  experience: 'Experience notes',
  personal: 'Personal facts',
  site_docs: 'Site docs',
  github_readme: 'GitHub',
};

function CopyIcon() {
  return (
    <svg className="chat-turn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="chat-turn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function HoodIcon() {
  return (
    <svg className="chat-turn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8v8M8 6h4a4 4 0 0 1 4 4v0M8 18h4a4 4 0 0 0 4-4v0" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg className="chat-turn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
    </svg>
  );
}

function Sources({
  items,
  headingId,
}: {
  readonly items: readonly SourceItem[];
  readonly headingId: string;
}) {
  // The knowledge map (desktop) and the Sources point at each other (lib/viz/events.ts): a source
  // hovered or focused here rings its star; a star hovered there marks its source here.
  const [linked, setLinked] = useState<string | null>(null);
  useEffect(
    () =>
      onMapEvent('knowledge-map:point-star', ({ id }) => {
        setLinked(id);
      }),
    [],
  );
  // One delegated listener on the list (pointing is an enhancement of plain list items): the
  // item under the pointer or holding focus names its chunk in `data-chunk`.
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const chunkOf = (target: EventTarget | null): string | null =>
      target instanceof Element
        ? (target.closest<HTMLElement>('[data-chunk]')?.dataset.chunk ?? null)
        : null;
    let current: string | null = null;
    const point = (id: string | null): void => {
      if (id === current) return;
      current = id;
      emitMapEvent('knowledge-map:point-source', { id });
    };
    const onOver = (event: Event): void => {
      point(chunkOf(event.target));
    };
    const onOut = (event: Event): void => {
      point(chunkOf((event as MouseEvent | FocusEvent).relatedTarget));
    };
    list.addEventListener('mouseover', onOver);
    list.addEventListener('mouseout', onOut);
    list.addEventListener('focusin', onOver);
    list.addEventListener('focusout', onOut);
    return () => {
      list.removeEventListener('mouseover', onOver);
      list.removeEventListener('mouseout', onOut);
      list.removeEventListener('focusin', onOver);
      list.removeEventListener('focusout', onOut);
      if (current !== null) emitMapEvent('knowledge-map:point-source', { id: null });
    };
  }, []);

  // The first rows only, until "Show N more" (sourceRows.ts). Measured only while every item is shown
  // (before the first cut, and while expanded), then the rest are hidden (`hidden`: out of the layout,
  // the Tab order and the accessibility tree). Never measured with items hidden: they report no
  // position, everything seemed to fit and the button vanished (Ivan, 2026-11-10). A new width
  // measures again, so a rotation or a resize re-cuts the list.
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    const allShown = expanded || cut === null;
    if (!list || !allShown) return;
    const tops = Array.from(list.children, (child) =>
      child instanceof HTMLElement ? child.offsetTop : 0,
    );
    setCut(firstHiddenIndex(tops));
  }, [items, width, expanded, cut]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      setWidth((previous) => {
        if (previous === next) return previous;
        setCut(null);
        return next;
      });
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
    };
  }, []);
  const hiddenFrom = expanded ? null : cut;
  const hiddenCount = cut === null ? 0 : items.length - cut;

  return (
    <section className="chat-turn__sources" aria-labelledby={headingId}>
      <h3 className="chat-turn__sources-title" id={headingId}>
        Sources
      </h3>
      <ul className="chat-turn__source-list" id={listId} ref={listRef}>
        {items.map((item, index) => (
          <li
            key={item.chunk_id}
            className="chat-turn__source"
            data-source={item.source_type}
            data-chunk={item.chunk_id}
            data-linked={linked === item.chunk_id ? '' : undefined}
            hidden={hiddenFrom !== null && index >= hiddenFrom}
          >
            <span className="chat-turn__source-dot" aria-hidden="true" />
            {item.url === null ? (
              <span>{item.title}</span>
            ) : (
              <a className="chat-turn__source-link" href={item.url}>
                {item.title}
              </a>
            )}
            {/* The kind is shown by the dot's colour; screen readers get it as text. */}
            <span className="chat-turn__source-kind">{`, ${SOURCE_KIND[item.source_type]}`}</span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          className="chat-turn__action chat-turn__action--more"
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded ? 'Show fewer' : `Show ${String(hiddenCount)} more`}
        </button>
      )}
    </section>
  );
}

export function ChatTurn({ turn, canRetry, onRetry, onAnnounce }: ChatTurnProps) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  // Under the hood starts collapsed under every answer (SPEC US-A9).
  const [hood, setHood] = useState<HoodState>('closed');
  const hoodRef = useRef<HTMLDivElement | null>(null);
  // Ends the closing if its transition never reports its end (it always should; a safety net).
  const closingTimer = useRef<number | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const article = useRef<HTMLElement | null>(null);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(closingTimer.current);
    },
    [],
  );

  const active = isActive(turn);
  const error = turn.error === null ? null : errorText(turn.error.code, turn.error.retryAfterS);
  const showRetry = canRetry && !active && (error === null || error.retryable);
  const showCopy = turn.answer !== '' && (turn.status === 'done' || turn.status === 'stopped');
  // Only a finished answer has its `usage` (sent right before `done`).
  const usage = turn.status === 'done' ? turn.usage : null;
  const hoodId = `${id}-hood`;

  // Opened: the whole panel scrolls into view (Ivan, 2026-11-06: only its top showed). `nearest`
  // moves only as far as needed; the panel's scroll margin keeps it clear of the docked input.
  useEffect(() => {
    if (hood !== 'open') return;
    hoodRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'instant' : 'smooth',
    });
  }, [hood]);

  const closed = (): void => {
    window.clearTimeout(closingTimer.current);
    setHood('closed');
  };

  // Closing: hidden when the fold's transition finishes, however long the machine takes to run it.
  // Without one (no transition support, or none started) it is hidden at once: nothing is folding.
  useEffect(() => {
    if (hood !== 'closing') return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const panel = hoodRef.current;
      // Duck-typed: a CSSTransition names its property (old engines and jsdom have no such API).
      const fold =
        panel !== null && typeof panel.getAnimations === 'function'
          ? panel
              .getAnimations()
              .find(
                (animation) =>
                  'transitionProperty' in animation &&
                  animation.transitionProperty === 'grid-template-rows',
              )
          : undefined;
      if (fold === undefined) {
        closed();
        return;
      }
      fold.finished.then(
        () => {
          if (!cancelled) closed();
        },
        () => {
          // Cancelled: reopened while closing; the open state takes over.
        },
      );
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [hood]);

  const toggleHood = (): void => {
    if (hood !== 'open') {
      // Closed, or reopened while closing: it unfolds again from where it is.
      window.clearTimeout(closingTimer.current);
      setHood('open');
      return;
    }
    if (prefersReducedMotion()) {
      // Without motion there is no closing transition to wait for.
      setHood('closed');
      return;
    }
    // The panel folds: its height goes to zero while it fades (UnderTheHood.scss), and everything
    // below follows it up smoothly. Hidden once that transition ends.
    setHood('closing');
    window.clearTimeout(closingTimer.current);
    closingTimer.current = window.setTimeout(closed, CLOSING_FALLBACK_MS);
  };

  const copy = (): void => {
    // Inside the click handler: browsers allow clipboard writes only from a user gesture.
    navigator.clipboard.writeText(turn.answer).then(
      () => {
        setCopied(true);
        onAnnounce('Copied');
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          setCopied(false);
        }, COPIED_MS);
      },
      () => {
        onAnnounce('Copying failed. Select the answer and copy it instead.');
      },
    );
  };

  return (
    <article
      ref={article}
      className="chat-turn"
      aria-labelledby={`${id}-question`}
      data-status={turn.status}
      // The reading position kept across pages (islands/Chat/useScrollAnchor.ts) names its turn.
      data-turn-id={turn.id}
      // Focus target after Retry: the Retry button disappears while the answer is regenerated.
      tabIndex={-1}
    >
      <div className="chat-turn__question">
        <h2 className="chat-turn__question-text" id={`${id}-question`}>
          {turn.question}
        </h2>
      </div>

      <div className="chat-turn__answer" aria-busy={active}>
        <ElioAvatar />

        <div className="chat-turn__bubble">
          {turn.status === 'pending' && (
            <ThinkingSteps
              step={turn.step}
              searches={turn.route === null || turn.route === 'about_ivan'}
            />
          )}

          {turn.answer !== '' && (
            <ChatMarkdown text={turn.answer} streaming={turn.status === 'streaming'} />
          )}

          {turn.status === 'stopped' && turn.answer === '' && (
            <p className="chat-turn__note">Stopped before the answer started.</p>
          )}

          {error !== null && (
            <div className="chat-turn__error">
              <svg
                className="chat-turn__error-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M12 3l9.5 17h-19z" />
                <path d="M12 10v4M12 17.5v.01" />
              </svg>
              <p className="chat-turn__error-text">
                <strong className="chat-turn__error-title">{error.title}</strong> {error.hint}
              </p>
            </div>
          )}

          {/* After the answer, not while it is written (Ivan, 2026-11-08): sources arrive before the
          first token, and a list growing under the thinking steps made the card jump. */}
          {!active && turn.sources.length > 0 && (
            <Sources items={turn.sources} headingId={`${id}-sources`} />
          )}

          {(showCopy || showRetry || usage !== null || turn.status === 'stopped') && (
            <div className="chat-turn__actions">
              {turn.status === 'stopped' && <span className="chat-turn__tag">Stopped</span>}
              {showCopy && (
                <button className="chat-turn__action" type="button" onClick={copy}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
              {showRetry && (
                <button
                  className="chat-turn__action"
                  type="button"
                  onClick={() => {
                    onRetry(turn.id);
                    article.current?.focus();
                  }}
                >
                  <RetryIcon />
                  Retry
                </button>
              )}
              {/* Last: wider than Copy and Retry, it wraps to its own row on a phone. */}
              {usage !== null && (
                <button
                  className="chat-turn__action"
                  type="button"
                  aria-expanded={hood === 'open'}
                  aria-controls={hoodId}
                  onClick={toggleHood}
                >
                  <HoodIcon />
                  {/* Two lines beside the icon: the label, then the time and cost under it. */}
                  <span className="chat-turn__action-lines">
                    Under the hood{' '}
                    {/* Part of the name: a visible label must be in the accessible name (WCAG 2.5.3). */}
                    <span className="chat-turn__action-note">{usageSummary(usage)}</span>
                  </span>
                </button>
              )}
            </div>
          )}

          {usage !== null && (
            // Rendered while collapsed too, so `aria-controls` always points at an element.
            <UnderTheHood
              id={hoodId}
              state={hood}
              onClosed={closed}
              panelRef={hoodRef}
              route={turn.route}
              language={turn.language}
              sources={turn.sources}
              usage={usage}
              finishReason={turn.finishReason}
            />
          )}
        </div>
      </div>
    </article>
  );
}
