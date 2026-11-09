// @ts-check
// Lighthouse budgets for the built site (docs/TESTING.md §5, mobile-performance.md), run with
// `lighthouse` 13 directly (ROADMAP 1.8, replacing @lhci/cli; ADR-0001).
//
//   pnpm run lighthouse            build first, then mobile + desktop
//   node scripts/lighthouse.mjs mobile
//
// Serves dist/ with gzip (so transfer sizes are gzip sizes, like production), runs each page three
// times per profile in Playwright's Chromium, takes the median of each metric and checks budgets.
// Reports are written to .lighthouseci/<profile>/ (git-ignored).
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { chromium } from '@playwright/test';
import lighthouse, { desktopConfig } from 'lighthouse';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(WEB_DIR, 'dist');
const KB = 1024;
const RUNS = 3;
export const PAGES = ['/', '/cv/'];

/** @typedef {'mobile' | 'desktop'} Profile */
/**
 * The numbers a budget looks at, from one Lighthouse run.
 * @typedef {{ performance: number, accessibility: number, bestPractices: number, seo: number,
 *   lcp: number, cls: number, tbt: number, scriptBytes: number }} Summary
 */

/**
 * Picks the numbers we budget from a Lighthouse result.
 * @param {any} lhr Lighthouse's result object (`runnerResult.lhr`)
 * @returns {Summary}
 */
export function summarize(lhr) {
  const score = (/** @type {string} */ id) => Number(lhr.categories[id]?.score ?? 0);
  const value = (/** @type {string} */ id) => Number(lhr.audits[id]?.numericValue ?? Infinity);
  /** @type {{ resourceType: string, transferSize: number }[]} */
  const resources = lhr.audits['resource-summary']?.details?.items ?? [];
  return {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
    lcp: value('largest-contentful-paint'),
    cls: value('cumulative-layout-shift'),
    tbt: value('total-blocking-time'),
    scriptBytes: resources.find((item) => item.resourceType === 'script')?.transferSize ?? 0,
  };
}

/**
 * The median of each number across runs (one slow outlier run does not fail the build).
 * @param {Summary[]} runs
 * @returns {Summary}
 */
export function medianSummary(runs) {
  const median = (/** @type {number[]} */ values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? NaN;
  };
  const keys = /** @type {(keyof Summary)[]} */ (Object.keys(runs[0] ?? {}));
  return /** @type {Summary} */ (
    Object.fromEntries(keys.map((key) => [key, median(runs.map((run) => run[key]))]))
  );
}

/**
 * Budget violations for one page (the same budgets the LHCI config had).
 * @param {string} page `/` or `/cv/`
 * @param {Profile} profile
 * @param {Summary} summary
 * @returns {string[]}
 */
export function budgetProblems(page, profile, summary) {
  /** @type {string[]} */
  const problems = [];
  const check = (/** @type {boolean} */ ok, /** @type {string} */ message) => {
    if (!ok) problems.push(`${profile} ${page}: ${message}`);
  };
  check(summary.cls <= 0.1, `CLS ${summary.cls.toFixed(3)} > 0.1`);
  check(summary.accessibility >= 0.95, `accessibility ${summary.accessibility} < 0.95`);
  if (page === '/') {
    // AI mode: JS loaded during the run, i.e. before the visualization island.
    check(summary.scriptBytes <= 150 * KB, `script ${summary.scriptBytes} B > 150 KB`);
  }
  if (page === '/cv/') {
    check(summary.performance >= 0.95, `performance ${summary.performance} < 0.95`);
    check(summary.bestPractices >= 0.95, `best practices ${summary.bestPractices} < 0.95`);
    check(summary.seo >= 0.95, `SEO ${summary.seo} < 0.95`);
    const lcpBudget = profile === 'mobile' ? 2500 : 2000;
    check(summary.lcp <= lcpBudget, `LCP ${Math.round(summary.lcp)} ms > ${lcpBudget} ms`);
    // INP cannot be measured in a lab run; Total Blocking Time is its lab proxy.
    check(summary.tbt <= 200, `TBT ${Math.round(summary.tbt)} ms > 200 ms`);
    check(summary.scriptBytes <= 30 * KB, `script ${summary.scriptBytes} B > 30 KB`);
  }
  return problems;
}

const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
});

/**
 * Whether `file` is `dir` itself or inside it. `path.relative` instead of a string prefix, so a
 * sibling such as `dist-other/` does not count as inside `dist/`.
 * @param {string} dir
 * @param {string} file
 */
export function isInside(dir, file) {
  const relative = path.relative(dir, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** A static server for dist/ with gzip for text responses, like production. */
function serveDist() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end(); // malformed %-encoding
      return;
    }
    let file = path.join(DIST, pathname);
    if (!isInside(DIST, file)) {
      response.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    const gzip =
      /text|javascript|json|svg/.test(type) &&
      /gzip/.test(request.headers['accept-encoding'] ?? '');
    response.writeHead(200, {
      'content-type': type,
      ...(gzip ? { 'content-encoding': 'gzip' } : {}),
    });
    const stream = createReadStream(file);
    (gzip ? stream.pipe(createGzip()) : stream).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** A free local port for Chromium's remote debugging (Lighthouse connects to it). */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

/**
 * One Lighthouse run in a fresh browser (no cache shared between runs).
 * @param {string} url
 * @param {Profile} profile
 */
async function runOnce(url, profile) {
  const port = /** @type {number} */ (await freePort());
  // The debugging port is local only and lives for one run; Lighthouse connects to it.
  const browser = await chromium.launch({
    args: [`--remote-debugging-port=${String(port)}`, '--remote-debugging-address=127.0.0.1'],
  });
  try {
    // Mobile is Lighthouse's default: Moto G Power emulation, simulated Slow 4G, 4x CPU.
    const result = await lighthouse(
      url,
      { port, output: 'html', logLevel: 'error' },
      profile === 'desktop' ? desktopConfig : undefined,
    );
    if (!result) throw new Error(`Lighthouse returned no result for ${url}`);
    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('dist/ is missing: run `pnpm run build` first (or `pnpm run lighthouse`).');
  }
  const profiles = /** @type {Profile[]} */ (
    process.argv[2] ? [process.argv[2]] : ['mobile', 'desktop']
  );
  const server = /** @type {import('node:http').Server} */ (await serveDist());
  const address = server.address();
  const origin = `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`;
  /** @type {string[]} */
  const problems = [];
  try {
    for (const profile of profiles) {
      const outDir = path.join(WEB_DIR, '.lighthouseci', profile);
      mkdirSync(outDir, { recursive: true });
      for (const page of PAGES) {
        /** @type {Summary[]} */
        const runs = [];
        for (let run = 1; run <= RUNS; run += 1) {
          const result = await runOnce(origin + page, profile);
          runs.push(summarize(result.lhr));
          const name = `${page === '/' ? 'home' : 'cv'}-${String(run)}`;
          writeFileSync(path.join(outDir, `${name}.html`), String(result.report));
        }
        const summary = medianSummary(runs);
        console.log(
          `${profile} ${page}: perf ${summary.performance} · a11y ${summary.accessibility} · ` +
            `LCP ${Math.round(summary.lcp)} ms · CLS ${summary.cls.toFixed(3)} · ` +
            `TBT ${Math.round(summary.tbt)} ms · JS ${(summary.scriptBytes / KB).toFixed(1)} KB`,
        );
        problems.push(...budgetProblems(page, profile, summary));
      }
    }
  } finally {
    server.close();
  }
  if (problems.length > 0) {
    console.error(`✘ Lighthouse budgets failed:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('✔ Lighthouse budgets met');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
