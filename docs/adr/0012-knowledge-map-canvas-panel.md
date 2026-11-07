# ADR-0012: Knowledge map — a framed Canvas 2D panel beside the chat

- **Status:** Proposed
- **Date:** 2026-11-07
- **Deciders:** Ivan Vasiunin

## Context

ADR-0005 chose SVG for the vector-space map behind the chat and set a decision gate (ROADMAP 6.5): if the prototype did not look good enough, a new ADR compares Canvas 2D and WebGL.

The gate was run with five prototypes on the real knowledge base (241 chunks, 2026-11-06/07):
1. **SVG background behind the chat** (three styles: drifting stars, constellations, nebulae). Rejected by Ivan: a guest cannot tell what it is ("smeared dots, blotches, something twitching"); the chat covered half of the map; constant motion said nothing.
2. **SVG framed card beside the chat, numbered badges.** Better, but two kinds of glowing marks were confusing.
3. **SVG card with concept names and a ⅓-scale inset for the site docs.** The inset read as an appendix; names lighting up on the map were noise.
4. **Canvas 2D card** (this decision): one map, stars that ignite slowly in the neon of their source's colour, a camera that eases onto the lit stars, a "Topics" line and a "What is this?" explainer. Ivan: "close to what I wanted"; then a white-hot neon core was added at his request.

What the accepted look needs and SVG cannot give well:
- **additive light** (overlapping glows brighten, like stars), which `mix-blend-mode` on SVG elements does not do in Safari (MDN compatibility data: `svg_elements`, Safari: no);
- a **smooth camera** (zoom and pan over 2.6 s) over every point at once, without per-frame style writes to hundreds of SVG nodes;
- per-star ignition over 2.2 s with a stagger, plus a dimming of everything else.

Constraints: the JS budget on `/` (≤ 200 KB gzip, ≤ 150 KB before the visualization); weak devices; reviewability by Ivan (a markup specialist); both themes; WCAG (the map is decoration, its content is text elsewhere).

## Options

| Option | Pros | Cons | Cost |
|---|---|---|---|
| **Canvas 2D, no library** | Additive glow (`globalCompositeOperation = 'lighter'`) in every browser; pre-rendered glow sprites (one `drawImage` per star per frame); a camera is one transform; draws only while something moves; 0 KB of dependencies | Imperative drawing code; hit-testing, DPR and theming by hand; screenshots instead of DOM assertions for the look | ~6–8 KB gzip of own code |
| SVG (ADR-0005) | Markup and CSS, Ivan's core skill; DOM is testable | No additive blending in Safari; a camera means transforming a group with hundreds of children; ignition per star needs per-star transitions with delays (possible) but no light adding up | Already prototyped; rejected at the gate |
| WebGL (raw, regl 2.1.x, three.js r17x) | Real bloom, scales to tens of thousands of points | Shader code Ivan cannot review; a library adds 30–150 KB gzip; context loss and fallbacks to handle; nothing in 241 points needs it | High |

## Decision

**Canvas 2D without a library**, in a framed card ("Knowledge map") to the right of the chat on wide desktop screens (`min-width: 80rem`); not shown below that width (Ivan, 2026-11-07: no mobile version for now).

- **Rendering:** one `<canvas aria-hidden="true">`, sized to its box at `devicePixelRatio` (capped at 2). Each star is drawn from pre-rendered radial-gradient sprites (one per source type and theme): a small core and a halo. Dark theme: halos add light (`'lighter'`); the lit core is a sprite going from near-white in the centre to the source colour at the edge ("neon"). Light theme: normal blending, saturated cores.
- **Animation:** a `requestAnimationFrame` loop that runs **only while something moves** (ignition, dimming, camera, hover ring) and stops at rest; no ambient drift or twinkle. Timings: dim 0.9 s, ignite 2.2 s per star with a 0.22 s stagger by rank, camera in 2.6 s / out 1.1 s, smoothstep / ease-in-out. Reduced motion: final states at once.
- **Layout:** the map is rotated once (3° steps) to fill the card with one scale for both axes (a projection's axes carry no meaning), Ivan's material on top; the angle is kept on resize. Site docs are drawn dimmer than Ivan's own material (area is not amount).
- **Interaction:** hover a star → a ring in its colour and a tooltip (title, topics, "Read for this answer · relevance"); hover or focus a source in the answer → the same ring and tooltip; both ways through typed DOM `CustomEvent`s between the islands.
- **Text alternatives:** the caption ("Elio read N passages… Topics: …"), the "What is this?" explainer, the Sources list and Under the hood carry everything the map shows.
- **Data:** `points.json` v2 adds each chunk's `title` and its concept ids `c`, and a `concepts` catalogue (SPEC §4.4); still no chunk text.

## Consequences

- **Lint rule changes:** `requestAnimationFrame` stays banned in `src/lib/viz/**` (pure, testable functions) and is allowed only in the map's renderer module, which draws to its canvas and never writes DOM attributes or styles per frame.
- **Testing:** pure functions (rotation fit, camera framing, easing, intensity, topic matching, `points.json` validation) get unit tests; the renderer gets a smoke test (it draws, stops when idle) and e2e screenshots in both themes; long-frame measurement at 4× / 6× CPU throttling stays in the decision record (prototype: 60 fps, 17 ms average frame at 4×).
- **SVG rules no longer apply** to the map (viewBox, ≤ 1,000 nodes, CSS-only animation); `.claude/rules/visualization.md` is rewritten for the canvas.
- **ADR-0005 is superseded** for rendering; its decision-gate process is what produced this record.
- **Revisit** if: the base grows past a few thousand chunks (WebGL), the canvas look must also reach phones, or Safari performance at 4× throttling drops below 30 fps.
