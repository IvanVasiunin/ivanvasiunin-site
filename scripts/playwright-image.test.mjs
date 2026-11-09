// The Playwright Docker image (visual snapshots, CI job `visual` and e2e:visual:linux) must match the
// installed @playwright/test version and be pinned by digest in both places (node --test).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { IMAGE } from '../apps/web/scripts/visual-linux.mjs';

const webPackage = JSON.parse(readFileSync('apps/web/package.json', 'utf8'));
const playwrightVersion = webPackage.devDependencies['@playwright/test'];

test('the image is pinned by digest and matches @playwright/test', () => {
  const match = /^mcr\.microsoft\.com\/playwright:v([\d.]+)-noble@sha256:[0-9a-f]{64}$/.exec(IMAGE);
  assert.ok(match, `unexpected image reference: ${IMAGE}`);
  assert.equal(match[1], playwrightVersion);
});

test('the CI visual job uses exactly the same image', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const container = /^\s+container:\s*(\S+)\s*$/m.exec(ci)?.[1];
  assert.equal(container, IMAGE);
});
