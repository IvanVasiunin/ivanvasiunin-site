// Tests for scripts/check-infra.mjs (node --test).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  composeProblems,
  devComposeProblems,
  dockerfileProblems,
  dockerignoreProblems,
} from './check-infra.mjs';

const hardened = {
  read_only: true,
  security_opt: ['no-new-privileges:true'],
  cap_drop: ['ALL'],
};

/** A compose config that passes every check; tests break one property at a time. */
function goodCompose() {
  return {
    services: {
      web: { ...hardened, image: 'site-web:abc123', ports: [{ target: 443 }] },
      api: { ...hardened, image: 'site-api:abc123', environment: { APP_ENV: 'production' } },
      db: {
        image: 'pgvector/pgvector:0.8.7-pg18-trixie',
        networks: { backend: {} },
        healthcheck: { test: ['CMD', 'pg_isready'] },
      },
    },
    networks: { backend: { internal: true }, edge: {} },
  };
}

test('a hardened compose config passes', () => {
  assert.deepEqual(composeProblems(goodCompose()), []);
});

test('only web may publish ports', () => {
  const compose = goodCompose();
  compose.services.db.ports = [{ target: 5432, published: '5432' }];
  assert.match(composeProblems(compose).join('\n'), /db: only web may publish ports/);
});

test('db must sit on internal networks only', () => {
  const compose = goodCompose();
  compose.services.db.networks = { backend: {}, edge: {} };
  assert.match(composeProblems(compose).join('\n'), /db: network edge must be internal/);
});

test('images need exact tags', () => {
  const compose = goodCompose();
  compose.services.web.image = 'site-web:latest';
  compose.services.api.image = 'site-api';
  const problems = composeProblems(compose).join('\n');
  assert.match(problems, /web: image needs an exact tag/);
  assert.match(problems, /api: image needs an exact tag/);
});

test('api must run in production and services built here must be hardened', () => {
  const compose = goodCompose();
  compose.services.api.environment = {};
  compose.services.web.read_only = false;
  const problems = composeProblems(compose).join('\n');
  assert.match(problems, /api: APP_ENV must be set to production/);
  assert.match(problems, /web: needs read_only/);
});

test('the real Dockerfiles pass', () => {
  for (const file of ['apps/web/Dockerfile', 'apps/api/Dockerfile']) {
    assert.deepEqual(dockerfileProblems(file, readFileSync(file, 'utf8')), [], file);
  }
});

test('a single-stage root image without a health check fails', () => {
  const problems = dockerfileProblems('x', 'FROM python:latest\nUSER root\nCMD ["x"]\n').join('\n');
  assert.match(problems, /must be multi-stage/);
  assert.match(problems, /needs an exact tag/);
  assert.match(problems, /non-root USER/);
  assert.match(problems, /HEALTHCHECK/);
});

test('the USER check looks at the runtime (last) stage only', () => {
  const text = 'FROM a:1 AS build\nUSER 10001\nFROM b:2\nHEALTHCHECK CMD true\n';
  assert.match(dockerfileProblems('x', text).join('\n'), /non-root USER/);
});

test('the real .dockerignore is an allow-list that keeps data/raw and .env out', () => {
  assert.deepEqual(dockerignoreProblems(readFileSync('.dockerignore', 'utf8')), []);
});

test('a deny-list .dockerignore fails', () => {
  const problems = dockerignoreProblems('node_modules\n!data/raw\n').join('\n');
  assert.match(problems, /must start with \*\*/);
  assert.match(problems, /must not include data/);
});

test('only the top-level data/*.md may be allowed into the build context', () => {
  const base = '**\n!data/*.md\n**/.env\ndata/raw\n';
  assert.deepEqual(dockerignoreProblems(base), []);
  for (const wider of ['!data/**', '!data/raw/*.md', '!data']) {
    assert.match(dockerignoreProblems(`${base}${wider}\n`).join('\n'), /must not include data/);
  }
});

/** A development compose config that passes: the db on loopback, the production image. */
function goodDevCompose() {
  return {
    services: {
      db: {
        image: 'pgvector/pgvector:0.8.7-pg18-trixie',
        ports: [{ host_ip: '127.0.0.1', published: '5432', target: 5432 }],
      },
    },
  };
}

test('a loopback-only development database passes', () => {
  assert.deepEqual(devComposeProblems(goodDevCompose(), goodCompose()), []);
});

test('the development database must not publish to the network', () => {
  const dev = goodDevCompose();
  dev.services.db.ports = [{ published: '5432', target: 5432 }];
  assert.match(devComposeProblems(dev, goodCompose()).join('\n'), /must bind 127\.0\.0\.1 only/);
});

test('the development database runs the production image', () => {
  const dev = goodDevCompose();
  dev.services.db.image = 'postgres:18';
  assert.match(devComposeProblems(dev, goodCompose()).join('\n'), /must match production/);
});
