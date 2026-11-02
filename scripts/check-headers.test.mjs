// Tests for scripts/check-headers.mjs (node --test).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assetHeaderProblems, pageHeaderProblems } from './check-headers.mjs';

function goodPageHeaders() {
  return {
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=()',
    'content-security-policy': "frame-ancestors 'none'; base-uri 'self'",
    'cross-origin-opener-policy': 'same-origin',
    'cache-control': 'no-cache',
  };
}

test('a page with every security header passes', () => {
  assert.deepEqual(pageHeaderProblems(goodPageHeaders()), []);
});

test('a missing or weak header is reported', () => {
  const headers = { ...goodPageHeaders(), 'x-content-type-options': undefined };
  headers['strict-transport-security'] = 'max-age=60';
  const problems = pageHeaderProblems(headers).join('\n');
  assert.match(problems, /x-content-type-options/);
  assert.match(problems, /strict-transport-security/);
});

test('a Server header and cached pages are reported', () => {
  const problems = pageHeaderProblems({
    ...goodPageHeaders(),
    server: 'Caddy',
    'cache-control': 'max-age=600',
  }).join('\n');
  assert.match(problems, /server: must not be sent/);
  assert.match(problems, /cache-control \(page\)/);
});

test('hashed assets must be immutable', () => {
  assert.deepEqual(
    assetHeaderProblems({ 'cache-control': 'public, max-age=31536000, immutable' }),
    [],
  );
  assert.equal(assetHeaderProblems({ 'cache-control': 'max-age=60' }).length, 1);
});
