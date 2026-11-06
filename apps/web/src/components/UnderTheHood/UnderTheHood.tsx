// Under the hood (SPEC US-A9, ROADMAP 5.2), layout "Pipeline" (Ivan, 2026-11-06): the steps an answer
// went through, top to bottom, like the question's path through the graph. Router → Retrieval (with
// the retrieved chunks and their relevance) → Relevance gate → Answer, each with its time, model and
// tokens, then the total time and the estimated cost.
//
// Allow-list rendering: only the fields named here reach the page, each through its own formatter.
// The `usage` and `sources` events were already reduced to the contract's fields by lib/sse/parse.ts;
// nothing else of the answer (no prompt, no model settings) ever reaches this component.
import type { ReactNode, Ref } from 'react';

import type { SourceItem } from '../../lib/api/types';
import type { Turn, TurnUsage } from '../../lib/chat/state';

import './UnderTheHood.scss';

type NodeUsage = TurnUsage['nodes'][number];
type Route = NonNullable<Turn['route']>;

/** `closing` plays the closing animation; the panel is hidden once it ends (`onClosed`). */
export type HoodState = 'open' | 'closing' | 'closed';

export interface UnderTheHoodProps {
  /** The panel's id: the toggle in ChatTurn points at it with `aria-controls`. */
  readonly id: string;
  /** Closed: in the page but hidden from everyone, screen readers included. */
  readonly state: HoodState;
  /** The closing animation has ended. */
  readonly onClosed: () => void;
  /** The panel element (ChatTurn scrolls it into view when it opens). */
  readonly panelRef?: Ref<HTMLDivElement>;
  readonly route: Turn['route'];
  readonly language: string | null;
  readonly sources: readonly SourceItem[];
  readonly usage: TurnUsage;
  readonly finishReason: Turn['finishReason'];
}

/** The graph steps the panel knows, in the order a question passes them. Others are not shown. */
const STEP_LABEL: Readonly<Record<string, string>> = {
  router: 'Router',
  retrieval: 'Retrieval',
  relevance_gate: 'Relevance gate',
  generate: 'Answer',
};
const STEP_ORDER = Object.keys(STEP_LABEL);

const ROUTE_LABEL: Readonly<Record<Route, string>> = {
  about_ivan: 'About Ivan',
  greeting: 'Greeting',
  off_topic: 'Off topic',
  injection: 'Attempt to change the rules',
};

const SOURCE_KIND: Readonly<Record<SourceItem['source_type'], string>> = {
  cv: 'CV',
  experience: 'Experience notes',
  personal: 'Personal facts',
  site_docs: 'Site docs',
  github_readme: 'GitHub',
};

const count = new Intl.NumberFormat('en-US');

/** "310 ms" below a second, "2.3 s" above. */
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${String(Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** "$0.0061": four decimals below a cent, where an answer's cost usually is; "$0" for nothing. */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}

/** "Tokens: 4,380 in (1,536 cached) → 402 out", or null for a step that called no model. */
export function formatTokens(node: NodeUsage): string | null {
  if (node.input_tokens === null || node.output_tokens === null) return null;
  const cached =
    node.cached_input_tokens !== null && node.cached_input_tokens > 0
      ? ` (${count.format(node.cached_input_tokens)} cached)`
      : '';
  return `Tokens: ${count.format(node.input_tokens)} in${cached} → ${count.format(node.output_tokens)} out`;
}

/** The summary next to the toggle's name: "2.3 s · $0.0061". */
export const usageSummary = (usage: TurnUsage): string =>
  `${formatDuration(usage.total_ms)} · ${formatCost(usage.estimated_cost_usd)}`;

function Step({
  name,
  node,
  children,
}: {
  readonly name: string;
  readonly node: NodeUsage | null;
  readonly children?: ReactNode;
}) {
  const tokens = node === null ? null : formatTokens(node);
  return (
    <li className="under-the-hood__step" data-step={name}>
      <p className="under-the-hood__step-head">
        <span className="under-the-hood__step-name">{STEP_LABEL[name] ?? name}</span>
        {node !== null && (
          <span className="under-the-hood__step-time">{formatDuration(node.ms)}</span>
        )}
      </p>
      {/* The model and its tokens on one line: a step stays short enough to see whole. */}
      {(node?.model != null || tokens !== null) && (
        <p className="under-the-hood__detail">
          {[node?.model, tokens].filter((part) => part != null).join(' · ')}
        </p>
      )}
      {node?.embedding_tokens != null && (
        <p className="under-the-hood__detail">{`${count.format(node.embedding_tokens)} embedding tokens`}</p>
      )}
      {children}
    </li>
  );
}

function Sources({ items }: { readonly items: readonly SourceItem[] }) {
  if (items.length === 0) {
    return <p className="under-the-hood__detail">Nothing relevant was found.</p>;
  }
  return (
    <ol className="under-the-hood__sources">
      {items.map((item) => (
        <li key={item.chunk_id} className="under-the-hood__source" data-source={item.source_type}>
          <p className="under-the-hood__source-head">
            {/* The bar shows the relevance; the number next to it says the same in text. */}
            <span
              className="under-the-hood__meter"
              style={{ '--relevance': Math.min(Math.max(item.score, 0), 1) }}
              aria-hidden="true"
            />
            <span className="under-the-hood__score">
              <span className="under-the-hood__hidden">Relevance </span>
              {item.score.toFixed(2)}
            </span>
            <span className="under-the-hood__source-title">{item.title}</span>
            <span className="under-the-hood__source-kind">{SOURCE_KIND[item.source_type]}</span>
          </p>
          <p className="under-the-hood__snippet">{item.snippet}</p>
        </li>
      ))}
    </ol>
  );
}

export function UnderTheHood({
  id,
  state,
  onClosed,
  panelRef,
  route,
  language,
  sources,
  usage,
  finishReason,
}: UnderTheHoodProps) {
  const byName = new Map(usage.nodes.map((node) => [node.name, node]));
  const steps = STEP_ORDER.filter((name) => byName.has(name));
  // A ready-made reply (greeting, refusal, "no information") comes from a template, not a model.
  const templated =
    !byName.has('generate') && (finishReason === 'templated' || finishReason === 'no_info');

  return (
    <div
      ref={panelRef}
      className="under-the-hood"
      id={id}
      hidden={state === 'closed'}
      data-state={state}
    >
      <div
        className="under-the-hood__card"
        onAnimationEnd={(event) => {
          // Only the card's own animation, not one bubbling up from inside it.
          if (event.target === event.currentTarget && state === 'closing') onClosed();
        }}
      >
        <ol className="under-the-hood__steps">
          {steps.map((name) => (
            <Step key={name} name={name} node={byName.get(name) ?? null}>
              {name === 'router' && route !== null && (
                <p className="under-the-hood__detail">
                  {language === null ? ROUTE_LABEL[route] : `${ROUTE_LABEL[route]} · ${language}`}
                </p>
              )}
              {name === 'retrieval' && <Sources items={sources} />}
              {name === 'relevance_gate' && (
                <p className="under-the-hood__detail">
                  {sources.length > 0 ? 'Passed' : 'Nothing above the threshold'}
                </p>
              )}
            </Step>
          ))}
          {templated && (
            <Step name="generate" node={null}>
              <p className="under-the-hood__detail">Ready-made reply, no model call</p>
            </Step>
          )}
        </ol>
        <p className="under-the-hood__total">
          {`Total ${formatDuration(usage.total_ms)} · about ${formatCost(usage.estimated_cost_usd)}`}
        </p>
      </div>
    </div>
  );
}
