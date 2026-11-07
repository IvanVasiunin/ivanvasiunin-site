---
paths:
  - "apps/web/src/islands/KnowledgeMap/**"
  - "apps/web/src/lib/viz/**"
  - "apps/web/public/data/**"
---

# Knowledge map (Canvas 2D)

Decision record: [ADR-0012](../../docs/adr/0012-knowledge-map-canvas-panel.md) (supersedes ADR-0005's SVG). Behaviour: SPEC US-A11, US-A12, §4.4. Verification tags: `[lint]`, `[test]`, `[review]`.

## Data
- `points.json` v2:
  - `{ version, points: [{ id, x, y, source_type, section, title, c }], concepts: [{ id, label, aliases }] }`;
  - coordinates normalized 0..1;
  - **no chunk text**.

  `[test]` (schema validation at the boundary, `lib/viz/points.ts`)
- `points.json` ≤ 50 KB gzip. `[test]`
- Point `id` equals `chunk_id` in the `sources` SSE event. `[test]`
- The file is fetched at runtime from `/data/points.json`. A failed fetch hides the map silently; the chat keeps working. `[test]`

## Where it shows
- A framed card to the right of the chat from `min-width: 80rem`; nothing below that width. The island hydrates only there (`client:media`). `[test]` (e2e: absent on mobile)

## Rendering
- One `<canvas aria-hidden="true">`, sized to its box at `devicePixelRatio` capped at 2. `[review]`
- Stars are drawn from **pre-rendered sprites** (radial gradients, one set per source type and theme): no `filter`, no `shadowBlur`, no per-frame gradient creation. `[review]`
- Dark sky in **both themes** ("night window", Ivan, 2026-11-07): the card follows the theme, its sky does not. Halos add light (`'lighter'`); the lit core is a near-white-to-colour "neon" sprite drawn normally. `[review]`
- Colours come from tokens (read once per theme change via `getComputedStyle`). `[review]`

## Animation
- `requestAnimationFrame` runs **only while something moves** (dimming, ignition, camera, hover ring) and stops at rest: no ambient drift, twinkle or pulse. Allowed only in the renderer module (`islands/KnowledgeMap/renderer.ts`); banned in `lib/viz/**`. The renderer never writes DOM attributes or styles per frame. `[lint]` (`no-restricted-globals` with the renderer excepted) `[test]` (the loop stops when idle)
- Timings are named constants (dim, ignite, stagger, camera in / out) and easing is a pure function. `[review]` `[test]`
- `prefers-reduced-motion: reduce` and light mode for weak devices (SPEC §6.3): final states at once, no camera move, no stagger. Light mode also switches on at runtime when over 25% of an animation's frames are long (`lib/viz/frames.ts`, judged when it ends; the card gets `data-slow-frames`). `[test]` (unit + `e2e/knowledge-map-perf.spec.ts`)

## Highlight
- Intensity is a pure function of relevance (`0.55 + 0.45 × score`), unit-tested. `[test]`
- Lit stars ignite in **their source's colour**; everything else dims. No names light up on the map; the "Topics" line in the caption names them. `[review]`
- Topics = concepts named in the answer (whole word, case-insensitive) that also occur in a read chunk's `c`; a pure, unit-tested function sharing the alias pattern with ingestion. `[test]`

## Layout and accessibility
- The map is decoration. Its content is text elsewhere: the caption (passages read, Topics), the Sources list, Under the hood, the "What is this?" explainer. `[review]`
- Hover a star or hover / focus a source → a ring in the star's colour and a tooltip; both directions through typed DOM `CustomEvent`s (`lib/viz/events.ts`). `[test]`
- The "What is this?" control is a `<button aria-expanded aria-controls>`; Escape closes it and focus returns to the button. `[test]`

## Tests
- Pure functions (rotation fit, camera framing, easing, intensity, topic matching, points validation) have unit tests. `[test]`
- After a visible change: e2e screenshots of the card in both themes; frame times at 4× CPU throttling (prototype: 60 fps, 17 ms average). `[test]` `[review]`
