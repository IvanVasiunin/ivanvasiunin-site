---
paths:
  - "apps/web/src/islands/VectorSpace/**"
  - "apps/web/src/lib/viz/**"
  - "apps/web/public/data/**"
---

# Vector-space visualization (SVG)

Decision record: [ADR-0005](../../docs/adr/0005-visualization-rendering.md). Verification tags: `[lint]`, `[test]`, `[review]`.

## Data
- `points.json`:
  - schema `{ version, points: [{ id, x, y, source_type, section }] }`;
  - coordinates normalized 0..1;
  - **no chunk text**.

  `[test]` (schema validation)
- `points.json` ≤ 50 KB gzip. `[test]`
- Point `id` equals `chunk_id` in the `sources` SSE event. `[test]` (contract test on fixtures)
- The file is fetched at runtime from `/data/points.json`. A failed fetch hides the map silently; the chat keeps working. `[test]`

## Markup
- One `<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">`, scaled by CSS. `[review]`
- Point density and radius adapt to the container (fewer / smaller points on narrow screens if needed). `[review]`
- ≤ ~1,000 point nodes. More requires a new ADR (Canvas 2D). `[test]` (assert node count on fixtures)

## Animation
- Animate only `transform` and `opacity`, via CSS. No SMIL (`<animate>`, `<animateTransform>`). No per-frame attribute or style updates from JS (`requestAnimationFrame` loops that write to the DOM are forbidden). `[lint]` (`no-restricted-globals` / `no-restricted-properties` for `requestAnimationFrame` in `src/lib/viz/` and `src/islands/VectorSpace/`; Stylelint transition rules) `[review]`
- **Glow:** a shared `radialGradient` in `<defs>`, or pre-made shapes. No SVG filters (`feGaussianBlur`, `filter:`) on animated or repeated elements. `[review]`
- Drift uses per-point CSS custom properties (`--dx`, `--dy`, `--delay`) set once at render. `[review]`
- **Pausing:**
  - drift pauses (`animation-play-state: paused`) when the map is off-screen (IntersectionObserver) or `document.hidden`;
  - under `prefers-reduced-motion: reduce` there is no drift; highlight is shown without motion.

  `[test]`
- **Light mode for weak devices:**
  - signals: `hardwareConcurrency ≤ 4`, `deviceMemory ≤ 4`, `connection.saveData`, or runtime long-frame detection;
  - in light mode there is no drift, highlight only;
  - thresholds are config.

  `[test]` (activation with mocked navigator properties)

## Highlight
- Highlight = set `data-active` + `--relevance` (0..1) on the matching points; CSS transitions do the rest. `[review]`
- Intensity is a pure function of relevance, unit-tested. Highlighted points are clearly distinguishable in **both** themes (contrast ≥ 3:1 against the background). `[test]`
- Colours per source type (`cv`, `experience`, `personal`, `site_docs`, `github_readme`) come from tokens. A legend explains them. `[review]`

## Layout and accessibility
- The map is decoration. Everything it shows is also available as text in Under the hood. `[review]`
- On mobile the map is dimmed and never overlaps chat text in a way that harms contrast. `[test]` (axe contrast on the chat over the map)

## Tests
- Pure functions (coordinate scaling, highlight selection, intensity mapping, light-mode decision) have unit tests. `[test]`
- After a visible change:
  - screenshots on desktop and mobile, in light and dark themes;
  - long-frame measurement at 4× and 6× CPU throttling, compared with the TESTING.md threshold.

  `[test]`
