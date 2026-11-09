# ADR-0010: Self-hosted fonts from pinned Fontsource packages

- **Status:** Accepted
- **Date:** 2026-11-02
- **Deciders:** Ivan Vasiunin

## Context

ROADMAP 1.3 requires self-hosted OFL fonts through the Astro Fonts API, no third-party requests and CLS < 0.1. The faces are Schibsted Grotesk (UI, headings) and Newsreader (Elio's answers, CV prose); Ivan approved them after a specimen comparison.

The Astro Fonts API (Astro 7.4.4, top-level `fonts` config) takes a provider:
- **remote providers** (Google, Fontsource) download the files at build time;
- **`local`** uses files from the project.

Requirements:
- builds must be reproducible, and visual snapshots must not change on their own;
- the Docker build (ROADMAP 1.6) and CI should not depend on a third-party API being up;
- licenses must be recorded (`docs/CREDITS.md`).

## Options

| Option | Pros | Cons | Cost |
|---|---|---|---|
| **A. `fontProviders.fontsource()` (remote)** | No dependencies; one line per family | Fetches the current Fontsource release on every build: a font update silently changes glyphs (visual snapshots fail, CREDITS drift); the build needs network access to Fontsource | — |
| **B. `fontProviders.google()`** | Same as A | Same as A, plus Google's own subsetting; no stronger guarantees | — |
| **C. Files committed to the repo + `local` provider** | Fully offline, pinned | Binary blobs in git; manual updates; manual unicode ranges | ~250 KB in git |
| **D. Pinned Fontsource npm packages + `local` provider** (chosen) | Versions pinned by `pnpm-lock.yaml` (integrity hashes); offline builds after install; updates through the normal dependency flow; the packages ship the OFL text | Two devDependencies; a small helper reads the packages' CSS for files and unicode ranges | 2 devDependencies, ~70 lines incl. tests |

Packages:
- `@fontsource-variable/schibsted-grotesk` 5.3.0;
- `@fontsource/newsreader` 5.3.0.

Both are OFL-1.1, published 2026-07-19, checked with `pnpm view` on 2026-11-02. Upstream sources are listed in `docs/CREDITS.md`.

## Decision

Option D.

- **Schibsted Grotesk:** the variable file, Latin only. It is preloaded. Astro cannot tell subsets apart in local files, so a second subset would be preloaded too.
- **Newsreader:** static 400 / 500 in normal and italic, Latin and Latin Extended. It is not preloaded; the browser fetches a file only when text needs it.
- **The helper** `apps/web/scripts/fontsource-variants.mjs` builds the `local` variants from the packages' CSS (file, weight, style, unicode-range). It is unit-tested.
- **Fallbacks:** Astro's metric-matched fallback faces keep the font swap from shifting the layout.

## Consequences

**Becomes easier**
- Builds give the same font files every time, so visual snapshots change only when we change something.
- No third-party requests at build time or at runtime.
- The OFL texts with copyright notices are kept in `docs/licenses/`.

**Becomes harder**
- Font updates are dependency updates: bump the packages, review the visual diff and update `docs/CREDITS.md`.
- The helper depends on Fontsource's CSS format. It fails loudly (it throws) if the format changes.

**Accepted**
- Neither family has Cyrillic. Russian text and symbols outside the subsets (for example →) use the system fonts.

**Revisit if**
- Elio answers in Russian often, which calls for a family with Cyrillic;
- Astro adds subset-aware preloading for local fonts, which would let the UI face take Latin Extended;
- the Fontsource packages stop being maintained.
