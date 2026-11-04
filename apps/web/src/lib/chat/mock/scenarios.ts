// Mocked answers of `/api/chat` (SPEC §4) for the dev server and the e2e tests. Never shipped to the
// browser: only `dev-server.ts` (astro dev) and e2e/ import this file.
//
// Until the real endpoint exists (ROADMAP 3.8), this is how the chat UI is reviewed and tested. The
// question picks the scenario, so every state can be reached by typing:
//   "hello"                      → a templated greeting (no sources)
//   "google"                     → nothing relevant: empty sources, a "no information" answer
//   "fail"                       → the stream breaks after a few tokens (error event)
//   "limit"                      → HTTP 429 before the stream (SPEC §4.3), retry in 30 s
//   "markdown"                   → unsafe Markdown (raw HTML, javascript: links) for the sanitizer
//   anything else                → a grounded answer about BrainRocket with three sources
import type { ChatEvent, ErrorResponse, SourceItem } from '../../api/types';

export interface MockStep {
  /** Pause before this event, in ms (the dev server waits; e2e tests send everything at once). */
  readonly delayMs: number;
  readonly event: ChatEvent;
}

export type MockScenario =
  | { readonly kind: 'stream'; readonly steps: readonly MockStep[] }
  | {
      readonly kind: 'http-error';
      readonly status: number;
      readonly retryAfterS: number | null;
      readonly body: ErrorResponse;
    };

const ROUTE_MS = 350;
const SOURCES_MS = 600;
const FIRST_TOKEN_MS = 450;
const TOKEN_MS = 28;

const SOURCES: readonly SourceItem[] = [
  {
    chunk_id: 'cv:brainrocket:2',
    score: 0.86,
    source_type: 'cv',
    title: 'CV — BrainRocket',
    section: 'Highlights',
    url: '/cv#job-brainrocket',
    snippet:
      'Traced a poor Lighthouse result to CSS mask in buttons repeated across the page, rewrote the components without masks…',
  },
  {
    chunk_id: 'experience:brainrocket:1',
    score: 0.78,
    source_type: 'experience',
    title: 'Experience notes — BrainRocket',
    section: 'Key stories',
    url: null,
    snippet: 'Led the team for several weeks during the team lead’s absence…',
  },
  {
    chunk_id: 'cv:skills:1',
    score: 0.61,
    source_type: 'cv',
    title: 'CV — Skills',
    section: null,
    url: '/cv#skills',
    snippet: 'HTML, CSS, SCSS, BEM, JavaScript, TypeScript, Angular…',
  },
];

export const BRAINROCKET_ANSWER = `At BrainRocket, Ivan works as a Senior Markup Developer on large-scale iGaming platforms across several brands. He is the team's go-to person for markup, SCSS and UI architecture.

A few highlights:

- **Homepage performance.** He traced a poor Lighthouse result to CSS \`mask\` in buttons repeated across the page and rewrote the components without masks.
- **Acting team lead.** For several weeks he led the team, which shipped several important releases on time.
- **Mentoring.** He mentored a trainee to Junior level and onboarded three developers.

More in the [CV](/cv#job-brainrocket).`;

export const GREETING_ANSWER = `Hi! I'm Elio, an AI assistant that answers questions about Ivan Vasiunin: his experience, skills and projects. Try asking what Ivan did at BrainRocket.`;

export const NO_INFO_ANSWER = `Ivan hasn't shared anything about that, so I can't say.`;

/** Raw HTML and dangerous links: the rendered answer must contain none of them as live markup. */
export const UNSAFE_ANSWER = `Here is **bold** text, a [safe link](/cv) and an [external one](https://github.com).

<img src="x" onerror="window.__xss = true">
<script>window.__xss = true</script>

[Click me](javascript:window.__xss=true)`;

/** Splits an answer into word-sized tokens, the way a model streams them. */
export function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

const tokens = (text: string): MockStep[] =>
  tokenize(text).map((piece, index) => ({
    delayMs: index === 0 ? FIRST_TOKEN_MS : TOKEN_MS,
    event: { type: 'token', text: piece },
  }));

const usage: MockStep = {
  delayMs: 0,
  event: {
    type: 'usage',
    nodes: [
      {
        name: 'generate',
        ms: 1840,
        model: 'mock',
        input_tokens: 4380,
        cached_input_tokens: 1536,
        output_tokens: 402,
        embedding_tokens: null,
      },
    ],
    total_ms: 2273,
    estimated_cost_usd: 0.0061,
  },
};

const done = (finishReason: 'stop' | 'templated' | 'no_info'): MockStep => ({
  delayMs: 0,
  event: {
    type: 'done',
    // A fixed id keeps the mock deterministic. Not all-zero: gitleaks reads "00…" as a phone prefix.
    message_id: 'b2e0c4a1-5d3f-4e8a-9c7b-1f2a3b4c5d6e',
    finish_reason: finishReason,
  },
});

const route = (to: 'about_ivan' | 'greeting'): MockStep => ({
  delayMs: ROUTE_MS,
  event: { type: 'route', route: to, language: 'en' },
});

const sources = (items: readonly SourceItem[]): MockStep => ({
  delayMs: SOURCES_MS,
  event: { type: 'sources', items: [...items] },
});

export function mockScenario(question: string): MockScenario {
  const q = question.toLowerCase();
  if (/\blimit\b/.test(q)) {
    return {
      kind: 'http-error',
      status: 429,
      retryAfterS: 30,
      body: {
        error: { code: 'rate_limited', message: 'Too many questions.', retry_after_s: 30 },
      },
    };
  }
  if (/\b(hi|hello|hey)\b/.test(q)) {
    return {
      kind: 'stream',
      steps: [route('greeting'), ...tokens(GREETING_ANSWER), usage, done('templated')],
    };
  }
  if (q.includes('google')) {
    return {
      kind: 'stream',
      steps: [route('about_ivan'), sources([]), ...tokens(NO_INFO_ANSWER), usage, done('no_info')],
    };
  }
  if (q.includes('fail')) {
    const error: MockStep = {
      delayMs: 300,
      event: {
        type: 'error',
        code: 'upstream_unavailable',
        message: 'The model is unavailable.',
        retry_after_s: null,
      },
    };
    return {
      kind: 'stream',
      steps: [
        route('about_ivan'),
        sources(SOURCES),
        ...tokens(BRAINROCKET_ANSWER).slice(0, 12),
        error,
      ],
    };
  }
  if (q.includes('markdown')) {
    return {
      kind: 'stream',
      steps: [route('about_ivan'), sources(SOURCES), ...tokens(UNSAFE_ANSWER), usage, done('stop')],
    };
  }
  return {
    kind: 'stream',
    steps: [
      route('about_ivan'),
      sources(SOURCES),
      ...tokens(BRAINROCKET_ANSWER),
      usage,
      done('stop'),
    ],
  };
}

/** One event in the wire format of `fastapi.sse.EventSourceResponse`. */
export const toSse = (event: ChatEvent): string => `data: ${JSON.stringify(event)}\n\n`;
