---
paths:
  - "apps/web/src/**"
  - "apps/web/astro.config.*"
  - "apps/web/lighthouserc.*"
---

# Mobile and weak devices

Budgets: SPEC §6.1 and `docs/TESTING.md` §5. Verification tags: `[test]`, `[review]`.

## Mobile layout
- Mobile-first, from 360 px. Checked at 360 / 390 / 768 / 1024 / 1440, in portrait and landscape. `[test]` (visual snapshots)
- Touch targets ≥ 44×44 px. `[review]` `[test]` (size assertions on primary controls)
- **No hover-only functionality.** Hover styles live inside `@media (hover: hover)`. `[review]`
- Use `svh` / `dvh` instead of `100vh`. Respect `env(safe-area-inset-*)`. The viewport meta includes `viewport-fit=cover` and `interactive-widget=resizes-content`. `[review]`
- **Chat on mobile:**
  - the input stays visible above the virtual keyboard. iOS Safari does not support `interactive-widget`, so `visualViewport` resize handling is the primary mechanism;
  - messages are not hidden under the keyboard;
  - the input computes to ≥ 16 px (1 rem).

  `[test]` (WebKit iPhone profile) `[review]` (manual iPhone check before release)
- The mode switcher is reachable with one hand (bottom-safe placement or a large sticky control on small screens). `[review]`
- On mobile, the visualization is dimmed and never covers chat text. `[test]`

## Weak devices
- **Light visualization mode:**
  - triggers: `navigator.hardwareConcurrency ≤ 4`, `navigator.deviceMemory ≤ 4` (where available), `navigator.connection?.saveData`, or long frames detected at runtime;
  - in light mode there is no drift, highlight only.

  `[test]`
- The visualization loads after the chat (`client:idle` / `client:visible`) and never blocks input. `[review]` `[test]` (INP budget)
- **Budgets (Lighthouse + bundle checks):**

  | Page | JS | Other |
  |---|---|---|
  | `/cv` | ≤ 30 KB gzip | — |
  | `/` | ≤ 200 KB gzip total; ≤ 150 KB before the visualization loads | `points.json` ≤ 50 KB gzip |

  - `/cv` mobile: LCP < 2.5 s, CLS < 0.1, INP < 200 ms, all four Lighthouse categories ≥ 95.

  `[test]`
- Playwright projects emulate mobile devices with Slow 4G and CPU throttling 4× / 6× (Chromium CDP). Long frames during drift and highlight are measured and compared with the threshold. `[test]`
- After noticeable visualization changes, profile with Chrome DevTools MCP (performance trace) and include the findings in the report. `[review]`
- Fonts: self-hosted, `font-display: swap`, a preloaded critical subset only. `[review]` `[test]` (CLS)
- Images: explicit dimensions, modern formats, lazy below the fold. `[review]`
