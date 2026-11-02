// @ts-check
// Checks the response headers of a running stack (infra-security.md: "[test] check of the
// response headers"). Used in CI against `docker compose up` and by hand against the server:
//   node scripts/check-headers.mjs https://localhost          (local stack, self-signed TLS)
//   node scripts/check-headers.mjs https://ivanvasiunin.com   (production)
import { request } from 'node:https';
import { fileURLToPath } from 'node:url';

/** Security headers every page response must carry (infra/Caddyfile). */
const REQUIRED = /** @type {const} */ ([
  ['strict-transport-security', /max-age=\d{7,}/],
  ['x-content-type-options', /^nosniff$/],
  ['referrer-policy', /^strict-origin-when-cross-origin$/],
  ['permissions-policy', /camera=\(\)/],
  ['content-security-policy', /frame-ancestors 'none'/],
  ['cross-origin-opener-policy', /^same-origin$/],
]);

/**
 * Problems with the headers of the home page response.
 * @param {Record<string, string | string[] | undefined>} headers lower-case names
 * @returns {string[]}
 */
export function pageHeaderProblems(headers) {
  /** @type {string[]} */
  const problems = [];
  for (const [name, pattern] of REQUIRED) {
    const value = headers[name];
    if (typeof value !== 'string' || !pattern.test(value)) {
      problems.push(`${name}: expected ${String(pattern)}, got ${String(value)}`);
    }
  }
  if (headers.server !== undefined)
    problems.push(`server: must not be sent, got ${String(headers.server)}`);
  if (headers['cache-control'] !== 'no-cache') {
    problems.push(
      `cache-control (page): expected no-cache, got ${String(headers['cache-control'])}`,
    );
  }
  return problems;
}

/**
 * Problems with a hashed build asset's caching.
 * @param {Record<string, string | string[] | undefined>} headers
 * @returns {string[]}
 */
export function assetHeaderProblems(headers) {
  const value = headers['cache-control'];
  return typeof value === 'string' && value.includes('immutable')
    ? []
    : [`cache-control (hashed asset): expected immutable, got ${String(value)}`];
}

/**
 * GET a URL. TLS verification is relaxed for localhost only (Caddy's local CA).
 * @param {URL} url
 * @returns {Promise<{ status: number, headers: Record<string, string | string[] | undefined>, body: string }>}
 */
function get(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, { rejectUnauthorized: url.hostname !== 'localhost' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const base = new URL(process.argv[2] ?? 'https://localhost');
  const page = await get(new URL('/', base));
  const asset = /\/_astro\/[^"']+\.css/.exec(page.body)?.[0];
  const health = await get(new URL('/api/health', base));

  const problems = [
    ...(page.status === 200 ? [] : [`GET / returned ${String(page.status)}`]),
    ...pageHeaderProblems(page.headers),
    ...(asset
      ? assetHeaderProblems((await get(new URL(asset, base))).headers)
      : ['no hashed CSS asset found on /']),
    ...(health.status === 200 && JSON.parse(health.body).db === 'ok'
      ? []
      : [`GET /api/health returned ${String(health.status)} ${health.body}`]),
  ];
  if (problems.length > 0) {
    console.error(`✘ Header checks failed for ${base.origin}:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`✔ Headers, caching and /api/health are correct on ${base.origin}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
