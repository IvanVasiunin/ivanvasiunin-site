import { gzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { collectGraph, findEntries, findImports, inlineScriptsSize } from './check-budgets.mjs';

describe('findEntries', () => {
  test('splits eager scripts from lazy (idle / visible) islands', () => {
    const html = `
      <script type="module" src="/_astro/page.js"></script>
      <link rel="modulepreload" href="/_astro/preload.js">
      <script type="module">import "/_astro/inline.js";</script>
      <script src="https://cdn.example.com/external.js"></script>
      <astro-island client="load" component-url="/_astro/Chat.js" renderer-url="/_astro/client.js"></astro-island>
      <astro-island component-url="/_astro/VectorSpace.js" client="idle" renderer-url="/_astro/client.js"></astro-island>`;

    expect(findEntries(html)).toEqual({
      eager: [
        '/_astro/page.js',
        '/_astro/preload.js',
        '/_astro/inline.js',
        '/_astro/Chat.js',
        '/_astro/client.js',
      ],
      lazy: ['/_astro/VectorSpace.js', '/_astro/client.js'],
    });
  });

  test('returns no entries for a page without JS', () => {
    expect(findEntries('<html><body><h1>CV</h1></body></html>')).toEqual({ eager: [], lazy: [] });
  });
});

describe('inlineScriptsSize', () => {
  test('sums the gzip size of inline JS and skips external scripts and JSON blocks', () => {
    const head = 'document.documentElement.setAttribute("data-theme","dark");';
    const module = 'const button=document.querySelector("button");button?.focus();';
    const html = `
      <script>${head}</script>
      <script type="module">${module}</script>
      <script type="module" src="/_astro/page.js"></script>
      <script type="application/ld+json">{"@type":"Person","name":"Ivan"}</script>
      <script type="importmap">{"imports":{}}</script>
      <script>  </script>`;

    expect(inlineScriptsSize(html)).toBe(gzipSync(head).length + gzipSync(module).length);
  });

  test('is zero for a page without inline JS', () => {
    expect(inlineScriptsSize('<html><body><h1>CV</h1></body></html>')).toBe(0);
  });
});

describe('findImports', () => {
  test('finds static, side-effect and dynamic imports of .js files', () => {
    const code = `import{a}from"./a.js";export{b}from './b.js';import "./c.js";const d=()=>import("./d.js");import x from "react";`;

    expect(findImports(code)).toEqual(['./a.js', './b.js', './c.js', './d.js']);
  });
});

describe('collectGraph', () => {
  test('follows imports once each and measures gzip sizes', () => {
    const files: Record<string, string> = {
      '/_astro/entry.js': 'import "./shared.js"; import("./lazy.js");',
      '/_astro/lazy.js': 'import "./shared.js"; export const lazy = 1;',
      '/_astro/shared.js': 'export const shared = 1;',
    };
    const read = (url: string): string => files[url] ?? '';

    const sizes = collectGraph(['/_astro/entry.js'], read);

    expect([...sizes.keys()].sort()).toEqual(Object.keys(files).sort());
    expect(sizes.get('/_astro/shared.js')).toBe(gzipSync(files['/_astro/shared.js'] ?? '').length);
  });
});
