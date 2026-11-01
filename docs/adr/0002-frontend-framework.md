# ADR-0002: Frontend framework — Astro with React islands

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** Ivan Vasiunin

## Context

The site has two very different pages:
- **`/cv`** must be a fast static page that works fully without JS.
- **`/`** must be server-rendered for SEO and no-JS users. It hosts two interactive parts: a streaming chat and an animated SVG visualization.

Budgets ([SPEC §6.1](../../SPEC.md)): ≤ 200 KB gzip JS on `/`, ≤ 30 KB on `/cv` (pending Q2).

The owner reviews all frontend code line by line. His strength is HTML / SCSS, and he has moderate React and TypeScript experience.

## Options

| Option | Pros | Cons |
|---|---|---|
| **Astro 7 + React islands** | 0 JS by default; `.astro` files are close to plain HTML, so easy to review; islands hydrate only the chat and visualization; content collections with Zod for the CV; static output that Caddy can serve | Two component syntaxes (`.astro` + `.tsx`); island-to-island communication must be explicit |
| Next.js 16 (App Router, RSC) | One React model everywhere, large ecosystem | Ships a React runtime on every page, including `/cv`; RSC and caching semantics add review burden; needs a Node server or static-export limitations |
| Vite + React SPA | Simplest mental model | No SSR, so weak SEO and link previews for `/` and `/cv`; JS required for everything |

## Decision

- **Astro 7 with `@astrojs/react`, static output.**
- **Pages:** `/`, `/cv` and `/privacy` are `.astro` pages.
- **Islands:** the chat and the vector-space visualization are React islands.
  - Chat: `client:load`, since it is the primary interaction.
  - Visualization: `client:idle` or `client:visible`, so it stays out of the critical path.
- **No `<ClientRouter>`:** mode switching uses native cross-document View Transitions, so it needs no JS.

## Consequences

- `/cv` ships no framework runtime. The Brief / Full and theme toggles are small inline or module scripts.
- **Island communication:** DOM `CustomEvent`s. There is no global store.
- **CV source:** an Astro content collection, also read by Python ingestion as plain Markdown files.
- **Escape hatch:** if the React islands exceed the budget, `preact/compat` can be swapped in without rewriting components.
