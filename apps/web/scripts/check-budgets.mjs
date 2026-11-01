// Checks the gzip size of JS (and points.json) in the production build against the budgets in
// docs/TESTING.md §5. Deterministic counterpart of Lighthouse CI: it follows every import, including
// lazy islands that a Lighthouse run may never load.
//
// Usage: pnpm run budget   (after `pnpm run build`)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const KB = 1024;

/** Budgets in gzip bytes. `beforeViz`: JS that loads before `client:idle` / `client:visible` islands. */
export const BUDGETS = {
  pages: {
    '/': { total: 200 * KB, beforeViz: 150 * KB },
    '/cv/': { total: 30 * KB, beforeViz: 30 * KB },
  },
  pointsJson: 50 * KB,
};

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]+)"`).exec(tag)?.[1];

/**
 * JS entry points referenced by a page, split by when they load.
 * @param {string} html
 * @returns {{ eager: string[], lazy: string[] }}
 */
export function findEntries(html) {
  const eager = new Set();
  const lazy = new Set();
  for (const [tag] of html.matchAll(/<script\b[^>]*\ssrc="[^"]+"[^>]*>/g))
    eager.add(attr(tag, 'src'));
  for (const [tag] of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*>/g))
    eager.add(attr(tag, 'href'));
  for (const [, code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const url of findImports(code)) eager.add(url);
  }
  for (const [tag] of html.matchAll(/<astro-island\b[^>]*>/g)) {
    const target = ['idle', 'visible'].includes(attr(tag, 'client') ?? '') ? lazy : eager;
    for (const name of ['component-url', 'renderer-url']) {
      const url = attr(tag, name);
      if (url) target.add(url);
    }
  }
  const isLocal = (url) => url?.startsWith('/') && !url.startsWith('//');
  return { eager: [...eager].filter(isLocal), lazy: [...lazy].filter(isLocal) };
}

/**
 * Gzip size of the JS written inline in a page (`<script>` without `src`), e.g. the theme head script
 * and small module scripts that Astro inlines. JSON data blocks (JSON-LD, import maps) are not JS.
 * @param {string} html
 * @returns {number}
 */
export function inlineScriptsSize(html) {
  let total = 0;
  for (const [tag, code = ''] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const opening = tag.slice(0, tag.indexOf('>') + 1);
    const type = attr(opening, 'type') ?? '';
    if (attr(opening, 'src') !== undefined || /json|importmap/.test(type) || code.trim() === '')
      continue;
    total += gzipSync(code).length;
  }
  return total;
}

/**
 * Module specifiers of static and dynamic imports that point to `.js` files.
 * @param {string} code
 * @returns {string[]}
 */
export function findImports(code) {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+\.js)["']/g;
  return [...code.matchAll(pattern)].map((match) => match[1] ?? '');
}

/**
 * Every file reachable from the entries, with its gzip size.
 * @param {string[]} entries site-absolute URLs, e.g. `/_astro/client.js`
 * @param {(url: string) => string} read returns the file contents for a site-absolute URL
 * @returns {Map<string, number>}
 */
export function collectGraph(entries, read) {
  const sizes = new Map();
  const queue = [...entries];
  while (queue.length > 0) {
    const url = queue.shift() ?? '';
    if (sizes.has(url)) continue;
    const code = read(url);
    sizes.set(url, gzipSync(code).length);
    for (const spec of findImports(code)) queue.push(new URL(spec, `http://site${url}`).pathname);
  }
  return sizes;
}

const sum = (sizes) => [...sizes.values()].reduce((total, size) => total + size, 0);
const kb = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

function main() {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  const read = (url) => readFileSync(path.join(dist, url), 'utf8');
  let failed = false;
  const report = (label, actual, budget) => {
    const ok = actual <= budget;
    failed ||= !ok;
    console.log(`${ok ? '✔' : '✘'} ${label}: ${kb(actual)} / ${kb(budget)}`);
  };

  for (const [page, budget] of Object.entries(BUDGETS.pages)) {
    const html = read(path.posix.join(page, 'index.html'));
    const { eager, lazy } = findEntries(html);
    const inline = inlineScriptsSize(html);
    const beforeViz = collectGraph(eager, read);
    const total = collectGraph([...eager, ...lazy], read);
    report(`${page} JS before visualization`, inline + sum(beforeViz), budget.beforeViz);
    report(`${page} JS total`, inline + sum(total), budget.total);
  }

  const points = path.join(dist, 'data/points.json');
  if (existsSync(points))
    report('points.json', gzipSync(readFileSync(points)).length, BUDGETS.pointsJson);
  else console.log('- points.json: not in this build (skipped)');

  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
