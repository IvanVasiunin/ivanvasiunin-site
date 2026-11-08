# apps/web — Astro + React islands

Static Astro 7 site with two React islands (Chat, KnowledgeMap). TypeScript **6.0.x** strict (TS 7 is not supported by typescript-eslint / @astrojs/check yet). SCSS + BEM. Node 24. Rules load automatically from `.claude/rules/` (html-a11y, css-scss, typescript, react, visualization, mobile-performance, testing).

## Layout
```
src/pages/          index.astro (AI mode, SSR'd intro + islands), cv.astro, privacy.astro
src/content/cv/     CV source: one Markdown file per job/section; Zod schema in src/lib/cv/schema.ts
src/components/     one folder per component (Astro or React)
src/islands/        Chat/, KnowledgeMap/ — the only hydrated code
src/lib/api/        schema.d.ts GENERATED from FastAPI OpenAPI — never edit by hand
src/lib/sse/        SSE client + ChatEvent parsing
src/lib/viz/        pure visualization logic (scaling, highlight, intensity)
src/styles/         tokens, layers, mixins, themes, print
public/data/        points.json in dev (git-ignored; served from a volume in production)
e2e/                Playwright tests (desktop, iPhone/WebKit, Android/Chromium with throttling)
```

## Commands (finalized in Phase 0 Stage 6)
| Purpose | Command |
|---|---|
| Dev server | `pnpm --dir apps/web run dev` |
| Fast checks | `pnpm --dir apps/web run check:fast` (prettier --check, eslint, stylelint, astro check, vitest) |
| Unit / component tests | `pnpm --dir apps/web run test` |
| E2E (+ axe, visual) | `pnpm --dir apps/web run e2e` · one project: `… run e2e --project=mobile-android` |
| Build (CV PDF from ROADMAP 2.5) | `pnpm --dir apps/web run build` |
| Bundle budgets | `pnpm --dir apps/web run budget` |
| Lighthouse budgets (mobile + desktop) | `pnpm --dir apps/web run lighthouse` |
| Regenerate API types (from ROADMAP 1.5) | `pnpm --dir apps/web run gen:api` |

## App-specific notes
- `/cv` ships no framework runtime: Brief/Full and theme toggle are tiny scripts. JS budget ≤ 30 KB gzip.
- Chat island `client:load`, KnowledgeMap `client:media="(min-width: 80rem)"` (desktop only, Canvas 2D, ADR-0012). Islands talk via typed DOM `CustomEvent`s, no global store.
- Mode switcher is `<nav>` + links with `aria-current="page"`, not ARIA tabs. Mode switching uses native cross-document View Transitions (no `<ClientRouter>`).
- Mobile chat keyboard: `visualViewport` handling is the primary mechanism (iOS Safari lacks `interactive-widget`).
- Until the real `/api/chat` exists (ROADMAP 3.8), `astro dev` serves a mocked one (`src/lib/chat/mock/`): the question picks the scenario (`hello`, `google`, `fail`, `limit`, `markdown`, anything else). `CHAT_MOCK=off` replaces it with a proxy of `/api` to the API running locally (`API_DEV_URL`, default `http://127.0.0.1:8000`), for real answers (docs/TESTING.md §2). E2E mocks the same scenarios with `page.route`.
- Fonts are self-hosted OFL via the Astro Fonts API; add every asset to `docs/CREDITS.md`.
- New components: use the `new-ui-component` skill; review with `frontend-reviewer`.
- Browser checks: Playwright CLI (snapshots to files) rather than an MCP; performance traces via Chrome DevTools MCP.
