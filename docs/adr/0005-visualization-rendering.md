# ADR-0005: Vector-space visualization rendering — SVG with a decision gate

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** Ivan Vasiunin

## Context

AI mode shows every knowledge-base chunk as a point on a 2D map behind the chat:
- points drift slowly;
- retrieved points light up by relevance.

The map is decoration (`aria-hidden`). It must run on weak phones, and the owner, a markup specialist, must be able to review and test the code.

Expected scale: a few hundred points, with a ceiling of ~1,000.

## Options

| Option | Performance | Reviewability | Notes |
|---|---|---|---|
| **SVG + CSS transforms / opacity** | Good up to ~1,000 nodes if only `transform` and `opacity` animate (compositor-friendly) and there are no per-element filters | High: it is markup and CSS, the owner's core skill | DOM nodes are inspectable and testable; theming through CSS custom properties |
| Canvas 2D | Scales to tens of thousands of points | Medium: imperative drawing code, harder to unit test visually | Needs its own hit-testing, theming and DPR handling |
| WebGL (raw, or Three.js / regl) | Scales furthest; glow effects are cheap | Low for this owner; shader code | Out of scope by default ([SPEC §7](../../SPEC.md)) |

## Decision

**SVG**, with strict rules:
- Use a `viewBox`, so the SVG scales to its container. Point density and size are adapted for mobile.
- Animate only `transform` and `opacity`, through CSS. No SMIL, no per-frame attribute updates from JS.
- Drift is a CSS animation with per-point delays and offsets set via CSS custom properties.
- **Glow:** one shared `radialGradient` in `<defs>`, or pre-made shapes. No `feGaussianBlur` or other SVG filters on animated elements.
- **Highlight:** JS only sets a data attribute or CSS custom property (`--relevance`) on the matching points. Motion comes from CSS transitions.
- **Pausing:**
  - when off-screen (IntersectionObserver) or when the tab is hidden: `animation-play-state: paused`;
  - under `prefers-reduced-motion` and in light mode for weak devices: no drift, highlight only.
- **Light mode for weak devices:** its signals and detection are in [SPEC §6.3](../../SPEC.md).

**Decision gate** before the visualization is considered done:
1. a prototype on mock data;
2. screenshots: desktop and mobile, light and dark themes;
3. long-frame measurements at 4× and 6× CPU throttling (Playwright + CDP, Chrome DevTools MCP traces);
4. the owner decides whether it looks good enough.

If the gate fails, a new ADR compares Canvas 2D and WebGL with their cost and how the owner can review that code.

## Consequences

- **Over ~1,000 point nodes**, a new ADR is required (likely Canvas 2D).
- **Unit tests:** coordinate scaling, choice of highlighted points, and relevance → intensity mapping are pure functions.
- **Colours:** one design token per source type, contrast-checked in both themes.
