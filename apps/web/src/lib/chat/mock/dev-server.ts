// A mocked `/api/chat` on the Astro dev server (`astro dev` only), so the chat can be tried before
// the real endpoint exists (ROADMAP 3.8). It streams the scenarios of scenarios.ts with realistic
// pauses. `astro:server:setup` runs only in dev: the build and the e2e preview never include it.
//
// Off with CHAT_MOCK=off: astro.config.mjs then forwards /api to the API running locally.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AstroIntegration } from 'astro';

import { CHAT_ENDPOINT } from '../../sse/client';
import { type MockScenario, mockScenario, toSse } from './scenarios';

const MAX_BODY_BYTES = 64 * 1024;

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

const questionOf = (body: unknown): string =>
  typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
    ? body.message
    : '';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function send(scenario: MockScenario, response: ServerResponse): Promise<void> {
  if (scenario.kind === 'http-error') {
    response.writeHead(scenario.status, {
      'Content-Type': 'application/json',
      ...(scenario.retryAfterS === null ? {} : { 'Retry-After': String(scenario.retryAfterS) }),
    });
    response.end(JSON.stringify(scenario.body));
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  for (const step of scenario.steps) {
    await wait(step.delayMs);
    // Stop in the UI aborts the request: stop writing, as the real API stops generating.
    if (response.destroyed || response.writableEnded) return;
    response.write(toSse(step.event));
  }
  response.end();
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
    response.end(JSON.stringify({ error: { code: 'invalid_request', message: 'Use POST.' } }));
    return;
  }
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'invalid_request', message: 'Invalid JSON.' } }));
    return;
  }
  await send(mockScenario(questionOf(body)), response);
}

export function chatMockIntegration(): AstroIntegration {
  return {
    name: 'chat-mock',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        if (process.env.CHAT_MOCK === 'off') return;
        server.middlewares.use(CHAT_ENDPOINT, (request, response) => {
          handle(request, response).catch(() => {
            if (!response.headersSent) response.writeHead(500);
            response.end();
          });
        });
        logger.info(`mocked ${CHAT_ENDPOINT} (scenarios: src/lib/chat/mock/scenarios.ts)`);
      },
    },
  };
}
