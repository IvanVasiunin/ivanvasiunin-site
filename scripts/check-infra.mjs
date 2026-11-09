// @ts-check
// Static checks of the deployment files (infra-security.md: "[test] compose config check",
// non-root images, pinned tags, health checks). Runs in CI and with `node scripts/check-infra.mjs`.
// Needs the Docker CLI for `docker compose config` (the daemon is not needed).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILT_HERE = ['web', 'api'];
const DOCKERFILES = ['apps/web/Dockerfile', 'apps/api/Dockerfile'];

/**
 * @typedef {{ host_ip?: string, published?: string | number, target?: number }} Port
 * @typedef {{ image?: string, ports?: unknown[], networks?: Record<string, unknown>,
 *   read_only?: boolean, security_opt?: string[], cap_drop?: string[],
 *   environment?: Record<string, string | null>, healthcheck?: unknown }} Service
 * @typedef {{ services: Record<string, Service>, networks?: Record<string, { internal?: boolean }> }} Compose
 */

/**
 * Problems in a resolved Compose config (`docker compose config --format json`).
 * @param {Compose} compose
 * @returns {string[]}
 */
export function composeProblems(compose) {
  /** @type {string[]} */
  const problems = [];
  const services = compose.services;
  for (const [name, service] of Object.entries(services)) {
    if (name !== 'web' && (service.ports ?? []).length > 0) {
      problems.push(`${name}: only web may publish ports`);
    }
    const tag = (service.image ?? '').split('/').pop()?.split(':')[1];
    if (!tag || tag === 'latest')
      problems.push(`${name}: image needs an exact tag, got ${String(service.image)}`);
  }
  const db = services.db;
  if (!db) {
    problems.push('db: service missing');
  } else {
    for (const network of Object.keys(db.networks ?? {})) {
      if (compose.networks?.[network]?.internal !== true) {
        problems.push(`db: network ${network} must be internal (no internet, no host access)`);
      }
    }
    if (!db.healthcheck) problems.push('db: needs a healthcheck');
  }
  if (services.api?.environment?.APP_ENV !== 'production') {
    problems.push('api: APP_ENV must be set to production in Compose');
  }
  for (const name of BUILT_HERE) {
    const service = services[name];
    if (!service) {
      problems.push(`${name}: service missing`);
      continue;
    }
    if (service.read_only !== true) problems.push(`${name}: needs read_only: true`);
    if (!(service.security_opt ?? []).some((option) => option.startsWith('no-new-privileges'))) {
      problems.push(`${name}: needs security_opt no-new-privileges`);
    }
    if (!(service.cap_drop ?? []).includes('ALL')) problems.push(`${name}: needs cap_drop: [ALL]`);
  }
  return problems;
}

/**
 * Problems in a Dockerfile: pinned bases, multi-stage, a non-root runtime user, a health check.
 * @param {string} name
 * @param {string} text
 * @returns {string[]}
 */
export function dockerfileProblems(name, text) {
  /** @type {string[]} */
  const problems = [];
  const froms = [...text.matchAll(/^FROM\s+(\S+)/gim)].map((match) => match[1] ?? '');
  if (froms.length < 2) problems.push(`${name}: must be multi-stage`);
  for (const image of froms) {
    const tag = image.split('/').pop()?.split(':')[1];
    if (!tag || tag === 'latest')
      problems.push(`${name}: base image needs an exact tag, got ${image}`);
  }
  const lastStage = text.slice(text.search(/^FROM\s+\S+(?![\s\S]*^FROM)/m));
  const user = /^USER\s+(\S+)/m.exec(lastStage)?.[1];
  if (!user || /^(root|0)(:|$)/.test(user))
    problems.push(`${name}: runtime stage needs a non-root USER`);
  if (!/^HEALTHCHECK\s/m.test(lastStage))
    problems.push(`${name}: runtime stage needs a HEALTHCHECK`);
  return problems;
}

/**
 * Problems in .dockerignore: it must be an allow-list that never lets data/raw or .env in. The only
 * data/ entry allowed is the top-level `!data/*.md` (the API's ingestion sources): a `*` never
 * crosses a `/`, so it cannot match data/raw/ files.
 * @param {string} text
 * @returns {string[]}
 */
export function dockerignoreProblems(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  /** @type {string[]} */
  const problems = [];
  if (lines[0] !== '**') problems.push('.dockerignore: must start with ** (allow-list)');
  for (const required of ['data/raw', '**/.env']) {
    if (!lines.includes(required)) problems.push(`.dockerignore: must exclude ${required}`);
  }
  if (lines.some((line) => line.startsWith('!data') && line !== '!data/*.md'))
    problems.push('.dockerignore: must not include data/ beyond !data/*.md');
  return problems;
}

/**
 * Problems in the resolved development Compose config (infra/docker-compose.dev.yml): its database
 * may publish a port to this machine only (127.0.0.1), never to the network, and runs the same
 * image as production.
 * @param {Compose} dev
 * @param {Compose} production
 * @returns {string[]}
 */
export function devComposeProblems(dev, production) {
  /** @type {string[]} */
  const problems = [];
  const db = dev.services.db;
  if (!db) return ['dev db: service missing'];
  for (const port of /** @type {Port[]} */ (db.ports ?? [])) {
    if (port.host_ip !== '127.0.0.1') {
      problems.push(`dev db: port ${String(port.published)} must bind 127.0.0.1 only`);
    }
  }
  const image = production.services.db?.image;
  if (db.image !== image) {
    problems.push(`dev db: image ${String(db.image)} must match production (${String(image)})`);
  }
  return problems;
}

/**
 * `docker compose config --format json` for one file, with placeholder secrets.
 * @param {string} file
 * @returns {Compose}
 */
function resolvedCompose(file) {
  const json = execFileSync(
    'docker',
    ['compose', '-f', path.join(ROOT, file), 'config', '--format', 'json'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        POSTGRES_PASSWORD: 'check-infra-placeholder',
        POSTGRES_MCP_PASSWORD: 'check-infra-placeholder',
        OPENAI_API_KEY: 'check-infra-placeholder',
      },
    },
  );
  return JSON.parse(json);
}

function main() {
  const production = resolvedCompose('infra/docker-compose.yml');
  const problems = [
    ...composeProblems(production),
    ...devComposeProblems(resolvedCompose('infra/docker-compose.dev.yml'), production),
    ...DOCKERFILES.flatMap((file) =>
      dockerfileProblems(file, readFileSync(path.join(ROOT, file), 'utf8')),
    ),
    ...dockerignoreProblems(readFileSync(path.join(ROOT, '.dockerignore'), 'utf8')),
  ];
  if (problems.length > 0) {
    console.error(`✘ Infrastructure checks failed:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('✔ Infrastructure checks passed');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
