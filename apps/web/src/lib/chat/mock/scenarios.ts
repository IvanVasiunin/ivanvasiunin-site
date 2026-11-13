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
//   a topic word                 → a grounded answer on that topic (TOPICS below): BrainRocket,
//                                  projects, this site, skills, personal life, contacts
//   anything else                → a short overview of Ivan with sources
// The answers are written from data/*.md and the CV, so the mock never says anything untrue.
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

export const SKILLS_ANSWER = `Ivan's core is frontend: **HTML, CSS / SCSS with BEM, JavaScript and TypeScript**, plus React, Next.js, Redux and TanStack Query, and Angular inside existing components at BrainRocket.

He cares most about responsive layouts, reusable UI components and frontend performance. On the AI side he has learned Python, LangChain, LangGraph and vector databases through a full AI Engineer course; this site is his first applied AI project.

See [Skills](/cv#skills) in the CV.`;

export const PROJECTS_ANSWER = `Ivan's main project is **NumbersValidator**, a production web tool he built at Liketelecom on his own initiative: it cleans, validates and converts phone-number lists and detects each number's type, operator and region.

Clients used it for about six months, and company revenue grew by 5% during that period. He also lists a study project (Little Lemon, the Meta Front-End capstone) and this website.

More in [Projects](/cv#projects).`;

export const SITE_ANSWER = `This site is Ivan's first AI project. I'm a **RAG assistant**: Ivan's CV, his notes and the site's own docs are split into chunks, embedded and stored in PostgreSQL with pgvector.

For each question I run a vector search and a full-text search, merge them with Reciprocal Rank Fusion and answer only from the chunks found. The backend is FastAPI with LangChain and LangGraph; the front end is Astro with a React island for this chat.`;

export const PERSONAL_ANSWER = `Ivan lives in Valencia, Spain, and he has a dog named **Monty**, a three-year-old corgi who is far too friendly to bring to the office on pet days.

In his free time he runs (he finished a marathon in 2021), plays padel, follows Formula 1 and is into space; in 2026 he saw his first Grand Prix live, in Madrid.`;

export const CONTACT_ANSWER = `Ivan is open to offers: frontend, UI and markup roles, and AI-focused roles where a strong frontend background helps. He prefers remote work and is open to relocation.

The best way to reach him is email (ivanvasyunin@gmail.com) or Telegram (@IvanVasiunin).`;

export const OVERVIEW_ANSWER = `Ivan Vasiunin is a frontend developer with nearly 10 years of commercial experience, now at BrainRocket, where he builds and reviews UI for large iGaming platforms. He is moving into AI Engineering, and this site is his first AI project.

Ask me about his work at BrainRocket, his skills, NumbersValidator, how this site works or how to contact him.`;

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

const NO_TOKENS = {
  model: null,
  input_tokens: null,
  cached_input_tokens: null,
  output_tokens: null,
  embedding_tokens: null,
} as const;

const ROUTER_NODE = {
  name: 'router',
  ms: 310,
  model: 'mock-router',
  input_tokens: 412,
  cached_input_tokens: 0,
  output_tokens: 18,
  embedding_tokens: null,
};

// The steps of the real graph (apps/api graph/nodes.py), so Under the hood looks as it will live.
const usage: MockStep = {
  delayMs: 0,
  event: {
    type: 'usage',
    nodes: [
      ROUTER_NODE,
      { ...NO_TOKENS, name: 'retrieval', ms: 120, embedding_tokens: 9 },
      { ...NO_TOKENS, name: 'relevance_gate', ms: 1 },
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

/** A ready-made reply: only the router called a model. */
const templatedUsage: MockStep = {
  delayMs: 0,
  event: { type: 'usage', nodes: [ROUTER_NODE], total_ms: 312, estimated_cost_usd: 0.0001 },
};

/** "No information": the search ran, nothing passed the gate, no model wrote the reply. */
const noInfoUsage: MockStep = {
  delayMs: 0,
  event: {
    type: 'usage',
    nodes: [
      ROUTER_NODE,
      { ...NO_TOKENS, name: 'retrieval', ms: 118, embedding_tokens: 7 },
      { ...NO_TOKENS, name: 'relevance_gate', ms: 1 },
    ],
    total_ms: 431,
    estimated_cost_usd: 0.0001,
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

/** The source type is the chunk id's prefix (`cv:…`, `personal:…`), as in the real index. */
const sourceType = (chunkId: string): SourceItem['source_type'] => {
  const prefix = chunkId.split(':', 1)[0] ?? '';
  switch (prefix) {
    case 'cv':
    case 'personal':
    case 'site_docs':
    case 'github_readme':
      return prefix;
    default:
      return 'experience';
  }
};

const source = (
  chunkId: string,
  score: number,
  title: string,
  url: string | null,
  snippet: string,
): SourceItem => ({
  chunk_id: chunkId,
  score,
  source_type: sourceType(chunkId),
  title,
  section: null,
  url,
  snippet,
});

interface Topic {
  readonly pattern: RegExp;
  readonly answer: string;
  readonly sources: readonly SourceItem[];
}

/** Checked in order; the first topic whose pattern matches the question answers it. */
export const TOPICS: readonly Topic[] = [
  {
    pattern: /brainrocket|igaming|current (job|role)|team ?lead|mentor/,
    answer: BRAINROCKET_ANSWER,
    sources: SOURCES,
  },
  {
    pattern: /numbersvalidator|liketelecom|project|portfolio|github|little lemon/,
    answer: PROJECTS_ANSWER,
    sources: [
      source(
        'cv:numbers-validator:0',
        0.88,
        'CV — NumbersValidator',
        '/cv#project-numbers-validator',
        'Web service that cleans, validates and converts phone numbers…',
      ),
      source(
        'experience:experience-notes:21',
        0.74,
        'Experience notes — Liketelecom',
        null,
        'Clients used the tool for about six months; revenue grew by 5%…',
      ),
      source(
        'github_readme:numbers-validator:0',
        0.62,
        'NumbersValidator — GitHub README',
        'https://github.com/IvanVasiunin/NumbersValidator#readme',
        'A web service for phone number checking and validation…',
      ),
    ],
  },
  {
    pattern: /\brag\b|this site|website|elio|built|architecture|how do you|how does (it|this)/,
    answer: SITE_ANSWER,
    sources: [
      source(
        'site_docs:architecture:6',
        0.84,
        'Architecture — Ingestion data flow',
        null,
        'Split at headings, embedded, stored in the chunks table…',
      ),
      source(
        'site_docs:0003-vector-database:2',
        0.71,
        'ADR-0003: Vector database',
        null,
        'Hybrid search: vector similarity + Postgres FTS, fused with RRF…',
      ),
    ],
  },
  {
    pattern: /skill|technolog|stack|tool|framework|react|typescript|javascript|css|python|angular/,
    answer: SKILLS_ANSWER,
    sources: [
      source(
        'cv:skills:0',
        0.86,
        'CV — Skills',
        '/cv#skills',
        'HTML5, CSS3, SCSS / Sass, BEM, JavaScript, TypeScript, React…',
      ),
      source(
        'experience:experience-notes:2',
        0.69,
        'Experience notes — Skills',
        null,
        'Frontend & web, AI Engineering, AI tools, engineering practices…',
      ),
    ],
  },
  {
    pattern: /\b(pet|dog|hobb|free time|sport|run|padel|formula|f1|space|family|live|from)/,
    answer: PERSONAL_ANSWER,
    sources: [
      source(
        'personal:about-me-personal:25',
        0.82,
        'About Ivan — Does he have a pet?',
        null,
        'Yes, Ivan has a dog named Monty — a three-year-old corgi…',
      ),
      source(
        'personal:about-me-personal:26',
        0.67,
        'About Ivan — What are his hobbies?',
        null,
        'Running, Formula 1, space, playing padel and learning new things…',
      ),
    ],
  },
  {
    pattern: /contact|reach|email|telegram|hire|hiring|\bjob|offer|available|remote|relocat/,
    answer: CONTACT_ANSWER,
    sources: [
      source(
        'personal:about-me-personal:21',
        0.8,
        'About Ivan — How can someone contact him?',
        null,
        'The best way is email or Telegram…',
      ),
      source(
        'personal:about-me-personal:17',
        0.7,
        'About Ivan — Is he open to job offers?',
        null,
        'Yes, Ivan is open to offers…',
      ),
    ],
  },
];

const OVERVIEW_SOURCES: readonly SourceItem[] = [
  source(
    'cv:profile:0',
    0.66,
    'CV — Profile',
    '/cv#summary',
    'Frontend developer with nearly 10 years of commercial experience…',
  ),
  source(
    'experience:experience-notes:0',
    0.58,
    'Experience notes — Summary',
    null,
    'Ivan is currently transitioning into AI Engineering…',
  ),
];

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
      steps: [route('greeting'), ...tokens(GREETING_ANSWER), templatedUsage, done('templated')],
    };
  }
  if (q.includes('google')) {
    return {
      kind: 'stream',
      steps: [
        route('about_ivan'),
        sources([]),
        ...tokens(NO_INFO_ANSWER),
        noInfoUsage,
        done('no_info'),
      ],
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
  const topic = TOPICS.find(({ pattern }) => pattern.test(q));
  return {
    kind: 'stream',
    steps: [
      route('about_ivan'),
      sources(topic?.sources ?? OVERVIEW_SOURCES),
      ...tokens(topic?.answer ?? OVERVIEW_ANSWER),
      usage,
      done('stop'),
    ],
  };
}

/** One event in the wire format of `fastapi.sse.EventSourceResponse`. */
export const toSse = (event: ChatEvent): string => `data: ${JSON.stringify(event)}\n\n`;
