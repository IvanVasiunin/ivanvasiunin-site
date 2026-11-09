# ADR-0009: Mode switch navigation — cross-document View Transitions with prerender on intent

- **Status:** Accepted
- **Date:** 2026-11-02
- **Deciders:** Ivan Vasiunin

## Context

The two modes, AI mode (`/`) and Text mode (`/cv`), are separate pages with their own URLs (SPEC §2, Q1). `/cv` ships no framework runtime (JS budget ≤ 30 KB gzip). Before any of the options below, a mode switch was a plain full-page navigation.

Ivan's request (ROADMAP 1.2): switching should feel like one app. The highlight should slide from one tab to the other, and there should be no visible page reload.

Constraints:
- progressive enhancement (rule: View Transitions only via `@view-transition`; the page is fully usable without them);
- reduced motion respected;
- no new dependencies;
- the future CSP has no `unsafe-inline` for scripts (SPEC §6, infra-security rule).

## Options

| Option | Pros | Cons | Cost |
|---|---|---|---|
| **A. Plain navigation** | Nothing to build or maintain | A visible reload and no motion; not what Ivan asked for | — |
| **B. Astro `<ClientRouter>` (SPA-style routing)** | No reload in every browser; could keep chat state across modes | Ships a router script to `/cv` (budget); replaces native navigation and needs care with islands, focus and scroll; apps/web/CLAUDE.md already rules it out | Router JS on every page; more code to review |
| **C. Native cross-document View Transitions only** | Zero JS, pure CSS opt-in; the header stays and the pill morphs between tabs; graceful fallback | The new page still has to load, so a slow network shows a pause before the transition; only Chrome 126+ and Safari 18.2+ (Firefox support UNVERIFIED) | A few lines of CSS |
| **D. C + Speculation Rules prerender on intent** (chosen) | The page under the hovered or pressed tab is prerendered, so the switch with its transition is near-instant; a JSON block, no JS; ignored where unsupported | Chromium only (Chrome, Edge, Opera; Safari and Firefox do not support it as of 2026, per MDN and secondary sources, UNVERIFIED for the latest versions); a prerender costs data and CPU even if the visitor does not switch; prerendered pages run their scripts early; the inline JSON block needs a CSP allowance | A JSON block and a few test and doc lines |

## Decision

Option D.

**View Transitions.**
- `@view-transition { navigation: auto; }` inside `@media (prefers-reduced-motion: no-preference)`, in `apps/web/src/styles/base.scss`.
- Named groups:
  - `mode-switch-indicator` for the pill;
  - `mode-switch-ai` and `mode-switch-text` for the tab labels.

  The labels are kept above the pill with a `z-index` on their `::view-transition-group`s. Every other element is part of the root cross-fade.

**Speculation Rules.**
- One `<script type="speculationrules">` in `BaseLayout.astro`:
  `{"prerender":[{"where":{"and":[{"selector_matches":".mode-switch__link"},{"not":{"selector_matches":"[aria-current=\"page\"]"}}]},"eagerness":"moderate"}]}`.
- In practice it prerenders only the other mode's page:
  - `moderate` starts on hover (desktop) or pointer-down (touch);
  - the current page's link is excluded.

## Consequences

**Becomes easier**
- Mode switching feels instant in Chromium and smooth in Safari, with no router JS.
- Every browser still navigates normally.

**Becomes harder or riskier**
- **Prerender data.** A hover on the AI mode tab prerenders `/`, including its React islands (up to the 200 KB JS budget). This is the accepted cost.
  - Revisit if mobile data use matters more: `conservative` eagerness, or `prefetch` instead of `prerender`.
- **Scripts run before the page is shown.**
  - Code that depends on the moment the page becomes visible must wait for `document.prerendering === false` (the `prerenderingchange` event):
    - analytics;
    - API calls;
    - autofocus;
    - the chat's `?q=` prefill.
  - The theme toggle already re-reads the stored theme on `prerenderingchange`.
  - ROADMAP 3.9 (chat UI) carries this requirement.
- **CSP (Phase 8).** The inline speculation rules need `'inline-speculation-rules'` in `script-src`, or the block's hash. This sits next to the hashes for the inline theme scripts.
- **Every same-origin navigation cross-fades,** not only mode switches. This is acceptable for a two-page site with a shared shell; revisit if a page needs a different transition (`pageswap` / `pagereveal` types).
- **e2e coverage is partial.**
  - Playwright checks that the transition runs (Chromium, no throttling) and is skipped under reduced motion.
  - Under CDP throttling, Chromium reveals the page without a transition, cause UNVERIFIED.
  - The prerender → activation path is not observable with init scripts, so it is a manual check on a real device (ROADMAP 7.5).

**Revisit if**
- Chat state must survive a mode switch, which could favour option B or state persistence;
- Firefox and Safari ship speculation rules, so the browser notes need updating;
- the data cost of prerendering `/` shows up in real-device checks.
