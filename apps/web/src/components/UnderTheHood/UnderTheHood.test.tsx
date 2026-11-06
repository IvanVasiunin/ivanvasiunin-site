import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SourceItem } from '../../lib/api/types';
import type { TurnUsage } from '../../lib/chat/state';
import {
  UnderTheHood,
  type UnderTheHoodProps,
  formatCost,
  formatDuration,
  formatTokens,
} from './UnderTheHood';

type NodeUsage = TurnUsage['nodes'][number];

const NONE = {
  model: null,
  input_tokens: null,
  cached_input_tokens: null,
  output_tokens: null,
  embedding_tokens: null,
};

const ROUTER: NodeUsage = {
  name: 'router',
  ms: 310,
  model: 'gpt-6-luna',
  input_tokens: 412,
  cached_input_tokens: 0,
  output_tokens: 18,
  embedding_tokens: null,
};

const GENERATE: NodeUsage = {
  name: 'generate',
  ms: 1840,
  model: 'gpt-6.1-terra',
  input_tokens: 4380,
  cached_input_tokens: 1536,
  output_tokens: 402,
  embedding_tokens: null,
};

const FULL: TurnUsage = {
  // Out of order on purpose: the panel shows the graph's order.
  nodes: [
    GENERATE,
    { ...NONE, name: 'relevance_gate', ms: 1 },
    ROUTER,
    { ...NONE, name: 'retrieval', ms: 120, embedding_tokens: 9 },
  ],
  total_ms: 2273,
  estimated_cost_usd: 0.0061,
};

const SOURCES: SourceItem[] = [
  {
    chunk_id: 'cv:brainrocket:2',
    score: 0.83,
    source_type: 'cv',
    title: 'BrainRocket — Senior Markup Developer',
    section: 'Key stories',
    url: '/cv#brainrocket',
    snippet: 'Traced a homepage performance problem to CSS masks…',
  },
  {
    chunk_id: 'experience:brainrocket:1',
    score: 0.71,
    source_type: 'experience',
    title: 'Experience notes — BrainRocket',
    section: null,
    url: null,
    snippet: 'Led the move to a shared component library…',
  },
];

function setup(overrides: Partial<UnderTheHoodProps> = {}) {
  const props: UnderTheHoodProps = {
    id: 'hood',
    hidden: false,
    route: 'about_ivan',
    language: 'en',
    sources: SOURCES,
    usage: FULL,
    finishReason: 'stop',
    ...overrides,
  };
  return render(<UnderTheHood {...props} />);
}

const stepNames = (): string[] =>
  screen
    .getAllByRole('listitem')
    .filter((item) => item.classList.contains('under-the-hood__step'))
    .map((item) => item.querySelector('.under-the-hood__step-name')?.textContent ?? '');

const step = (name: string): HTMLElement => {
  const item = screen
    .getAllByRole('listitem')
    .find((li) => li.querySelector('.under-the-hood__step-name')?.textContent === name);
  if (item === undefined) throw new Error(`no step ${name}`);
  return item;
};

describe('UnderTheHood', () => {
  it('shows the steps in the order a question passes them', () => {
    setup();

    expect(stepNames()).toEqual(['Router', 'Retrieval', 'Relevance gate', 'Answer']);
  });

  it('shows the route, the language, each step time, model and tokens', () => {
    setup();

    const router = within(step('Router'));
    expect(router.getByText('310 ms')).toBeTruthy();
    expect(router.getByText('gpt-6-luna')).toBeTruthy();
    expect(router.getByText('412 in → 18 out')).toBeTruthy();
    expect(router.getByText('About Ivan · en')).toBeTruthy();
    const answer = within(step('Answer'));
    expect(answer.getByText('1.8 s')).toBeTruthy();
    expect(answer.getByText('4,380 in (1,536 cached) → 402 out')).toBeTruthy();
    expect(within(step('Retrieval')).getByText('9 embedding tokens')).toBeTruthy();
    expect(within(step('Relevance gate')).getByText('Passed')).toBeTruthy();
    expect(screen.getByText('Total 2.3 s · about $0.0061')).toBeTruthy();
  });

  it('lists the retrieved chunks with their relevance, kind and snippet', () => {
    setup();

    const retrieval = within(step('Retrieval'));
    // The number is announced with its meaning; the bar itself is hidden from screen readers.
    expect(step('Retrieval').querySelector('.under-the-hood__score')?.textContent).toBe(
      'Relevance 0.83',
    );
    expect(retrieval.getByText('BrainRocket — Senior Markup Developer')).toBeTruthy();
    expect(retrieval.getByText('Experience notes')).toBeTruthy();
    expect(retrieval.getByText('Led the move to a shared component library…')).toBeTruthy();
    const meters = step('Retrieval').querySelectorAll<HTMLElement>('.under-the-hood__meter');
    expect([...meters].map((meter) => meter.style.getPropertyValue('--relevance'))).toEqual([
      '0.83',
      '0.71',
    ]);
    expect(meters[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says when nothing passed the relevance gate (empty)', () => {
    setup({
      sources: [],
      finishReason: 'no_info',
      usage: { ...FULL, nodes: FULL.nodes.filter((node) => node.name !== 'generate') },
    });

    expect(within(step('Retrieval')).getByText('Nothing relevant was found.')).toBeTruthy();
    expect(within(step('Relevance gate')).getByText('Nothing above the threshold')).toBeTruthy();
    expect(within(step('Answer')).getByText('Ready-made reply, no model call')).toBeTruthy();
  });

  it('shows a templated reply as the router and a ready-made answer', () => {
    setup({
      route: 'greeting',
      sources: [],
      finishReason: 'templated',
      usage: { nodes: [ROUTER], total_ms: 312, estimated_cost_usd: 0.0001 },
    });

    expect(stepNames()).toEqual(['Router', 'Answer']);
    expect(screen.getByText('Greeting · en')).toBeTruthy();
  });

  it('renders only the fields it knows: no unknown step, no extra field', () => {
    // A server bug or a tampered stored turn must not put prompt text on the page.
    const leaky = {
      ...ROUTER,
      name: 'system_prompt',
      prompt: 'You are Elio. SECRET RULES',
    } as unknown as NodeUsage;
    const withExtra = { ...ROUTER, system: 'SECRET RULES' } as unknown as NodeUsage;
    const { container } = setup({ usage: { ...FULL, nodes: [withExtra, leaky] } });

    expect(container.textContent).not.toContain('SECRET RULES');
    expect(container.textContent).not.toContain('system_prompt');
    expect(stepNames()).toEqual(['Router']);
  });

  it('is in the page but hidden while collapsed', () => {
    const { container } = setup({ hidden: true });

    const panel = container.querySelector('#hood');
    expect(panel?.hasAttribute('hidden')).toBe(true);
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('formatters', () => {
  it.each([
    [0, '0 ms'],
    [310, '310 ms'],
    [999, '999 ms'],
    [1000, '1.0 s'],
    [2273, '2.3 s'],
  ])('formatDuration(%d) is %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  it.each([
    [0, '$0'],
    [0.0061, '$0.0061'],
    [0.0123, '$0.012'],
  ])('formatCost(%d) is %s', (usd, text) => {
    expect(formatCost(usd)).toBe(text);
  });

  it('formats tokens only for a step that called a model', () => {
    expect(formatTokens(ROUTER)).toBe('412 in → 18 out');
    expect(formatTokens({ ...NONE, name: 'retrieval', ms: 1 })).toBeNull();
  });
});
