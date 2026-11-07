---
name: perf-check
description: Measures the site against its performance budgets — bundle and points.json sizes, Lighthouse mobile / desktop, the knowledge map under 4× / 6× CPU throttling (headless e2e) and, after a visible map change, real-Chrome frame times through Chrome DevTools MCP. Use after any change to the knowledge map, lib/viz, the islands' loading, or before a release (ROADMAP 6.4, 7.4).
---

# Performance check

Budgets: `docs/TESTING.md` §5 and CLAUDE.md rule 9. Rules: `.claude/rules/mobile-performance.md`, `.claude/rules/visualization.md`. Run the steps that match the change; report every number in the step report's **Проверки** table.

## 1. Sizes (always)
```
pnpm --dir apps/web run build
pnpm --dir apps/web run budget
```
`/` JS ≤ 150 KB before the map, ≤ 200 KB total; `/cv` ≤ 30 KB; `points.json` ≤ 50 KB (all gzip).

## 2. Lighthouse (pages, fonts, loading changed)
```
pnpm --dir apps/web run lighthouse
```
Mobile `/cv`: LCP < 2.5 s, CLS < 0.1, ≥ 95 in all four categories. Reports land in `apps/web/.lighthouseci/`.

## 3. The knowledge map under CPU throttling (headless, any map change)
```
pnpm --dir apps/web run e2e e2e/knowledge-map-perf.spec.ts --project=desktop-chromium --reporter=list
```
- Checks the map's work per frame at 4× (median < 16.7 ms) and that the light-mode detector (`lib/viz/frames.ts`) agrees with the frames at 4× and 6×.
- Each test leaves a `frames` annotation (frames, median work, long gaps, light mode). Copy the numbers into the report (`--reporter=json` shows them).
- Headless Chromium rasterizes the canvas in software on the throttled CPU: its long-frame shares are far worse than a real Chrome's. Never tune thresholds from them; use step 4.
- Kill any leftover `astro preview` first (`pnpm --dir apps/web exec astro preview stop`): Playwright's web server cannot start next to one.

## 4. Real Chrome (after a visible map change, before a release)
Chrome DevTools MCP drives a headed Chrome with a GPU. Measure the production build, not `astro dev` (React's dev build and the dev mock's token-by-token stream add long frames of their own).

1. Build, then serve with a canned answer:
   ```
   pnpm --dir apps/web run build
   cp <scratchpad>/sse-body.txt apps/web/dist/__sse.txt   # see below
   pnpm --dir apps/web exec astro preview --port 4401     # in the background
   ```
   `sse-body.txt`: the dev mock's answer, captured once from `astro dev`:
   `curl -s -N -X POST http://localhost:4321/api/chat -H "Content-Type: application/json" -d '{"message":"What did Ivan do at BrainRocket?","history":[]}' > sse-body.txt`.
   Never commit `dist/`; the file disappears with the next build.
2. `new_page` / `navigate_page` to `http://localhost:4401/` with `initScript` = the contents of [`frame-probe.js`](frame-probe.js). It answers `/api/chat` with `/__sse.txt` and times every frame the map draws. An `initScript` applies to that one navigation only: navigate again (do not reload) for every run.
3. `emulate` the viewport `1440x900x1` and `cpuThrottlingRate` 4, then 6. Each `emulate` call replaces all settings.
4. `evaluate_script` with [`measure.js`](measure.js): it asks the question, waits 9 s and returns the frames, the median and p90 work, the median gap, the long gaps (> 50 ms) and whether light mode switched on (`[data-slow-frames]`).
5. Budget (TESTING.md §5): under 5% long frames during an ignition at 4×. At 6× the motion may run at about 30 fps. The light-mode detector switches on only when over 25% of an ignition's frames are long.
6. For a closer look, record `performance_start_trace` / `performance_stop_trace` around one answer and name the longest tasks.
7. Stop the preview (`astro preview stop`) and reset the throttling (`emulate` without `cpuThrottlingRate`).

## Reference (2026-11-07, production build, headed Chrome, 1440×900, DPR 1)
| CPU | Map frames in 9 s | Median work | Median gap | Long frames | Light mode |
|---|---|---|---|---|---|
| 4× | 156 | 8.1 ms | 13.9 ms | 1.9% (the answer's own render) | off |
| 6× | 80 | 19.2 ms | 34.7 ms | 7.6% (mostly the same burst) | off |

A change that moves these numbers noticeably gets a line in the step report and, if it is lasting, a new row here.
