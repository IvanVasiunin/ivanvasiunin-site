---
paths:
  - "apps/web/src/**/*.{scss,css,astro,tsx}"
---

# CSS / SCSS

Verification tags: `[lint]` Stylelint, `[test]` automated test, `[review]` review only.

## Architecture
- Cascade layers, declared once as an inline `<style>` first in `<head>` (`src/layouts/BaseLayout.astro`), before any bundled CSS: `@layer reset, base, tokens, components, utilities;`. A statement inside a bundled file is not enough: the bundler may emit component CSS first. Component styles live in `components`. Nothing is unlayered except third-party CSS that cannot be layered. `[test]` (e2e/layout.spec.ts)
- Resets use `:where()` to keep specificity at zero. `[review]`
- SCSS modules use `@use` / `@forward`; `@import` is forbidden. `[lint]` (`at-rule-disallowed-list: [import]`; `scss/load-no-partial-leading-underscore`)
- **SCSS variables and mixins** are for build-time values only (breakpoints, mixins for media queries). Everything that themes or varies at runtime is a CSS custom property. `[review]`

## Naming
- **BEM** everywhere: `.block`, `.block__element`, `.block--modifier`, `.block__element--modifier`. Lowercase kebab-case words. No tag-qualified classes (`div.card`). State classes use `is-` / `has-` prefixes, or better, ARIA / data attributes (`[aria-expanded="true"]`, `[data-state]`). `[lint]` (stylelint-selector-bem-pattern, `selector-class-pattern`, `selector-no-qualifying-type`)
- One block per component file. A component's styles never target another block's elements. `[review]`

## Specificity
- No ID selectors. `[lint]` (`selector-max-id: 0`)
- SCSS nesting depth ≤ 3. `[lint]` (`max-nesting-depth: 3`)
- Compound selector depth ≤ 3; no `*` in component styles. `[lint]` (`selector-max-compound-selectors: 3`, `selector-max-universal`)
- `!important` is forbidden. `[lint]` (`declaration-no-important`)

## Layout
- Layout is Grid / Flex only. `float` is forbidden. `[lint]` (`property-disallowed-list: [float]`)
- `position: absolute | fixed` only for overlays and decoration (e.g. tooltips over the knowledge map), never for layout. `[review]`
- Mobile-first: base styles target 360 px, and enhancements go in `min-width` media queries through the breakpoint mixins (`@include mq(md)`). Container queries for components whose layout depends on their container. `[review]`
- Logical properties: `margin-inline`, `padding-block`, `inset-inline-start`, `inline-size`, etc., instead of physical left / right / top / bottom equivalents. `[lint]` (stylelint-use-logical: `csstools/use-logical`)
- Viewport heights use `svh` / `dvh` / `lvh`; the `vh` unit is forbidden. Safe areas via `env(safe-area-inset-*)`. `[lint]` (`unit-disallowed-list: [vh]`)

## Tokens
- Design tokens are CSS custom properties defined in the `tokens` layer:
  - colours;
  - spacing;
  - type scale;
  - line heights;
  - radii;
  - shadows;
  - durations;
  - easings;
  - z-index (a fixed scale).

  `[review]`
- No magic numbers: `color`, `background-color`, `border-color`, `fill`, `stroke`, `z-index`, `transition-duration`, `transition-timing-function`, `font-size`, `border-radius` and `box-shadow` take `var(--…)` (or `inherit` / `currentColor` / `transparent` / `0`). `[lint]` (stylelint-declaration-strict-value)
- Colour tokens exist for both themes. Themes switch by redefining tokens under `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` (the latter guarded by `:root:not([data-theme="light"])`). `[review]`

## Units
- `font-size` uses `rem`, or `clamp()` whose min / max are `rem` (fluid typography). `px` for font-size is forbidden. `[lint]` (`declaration-property-unit-allowed-list: { font-size: [rem, vw, "%"] }`)
- `line-height` is unitless. `[lint]` (`declaration-property-unit-allowed-list: { line-height: [] }`)
- `px` for borders, outlines, hairlines, shadows and spacing tokens. `[review]`
- Form inputs' computed font size is ≥ 1rem (16 px), so that iOS does not zoom. `[test]`

## States
- Every interactive element styles all applicable states:
  - default;
  - `:hover` — **only** inside `@media (hover: hover)`;
  - `:focus-visible`;
  - `:active`;
  - `:disabled` / `[aria-disabled="true"]`;
  - loading — `[aria-busy="true"]` or `[data-state="loading"]`.

  `[review]` (no Stylelint rule can check that `:hover` sits inside `@media (hover: hover)`)
- `outline: none` / `outline: 0` without a visible replacement in the same rule is forbidden. `[review]`

## Motion
- State changes animate via `transition` with duration and easing tokens. `transition: all` is forbidden; properties are listed explicitly. `[lint]` (`declaration-property-value-disallowed-list: { transition: [/\ball\b/], transition-property: [/\ball\b/] }`)
- Animate **only** `transform` and `opacity`. Never `width`, `height`, `top`, `left`, `margin`, `padding`, `filter`, `mask`, `clip-path` or `box-shadow`. `[lint]` (`declaration-property-value-allowed-list` for `transition-property`) `[review]`
  - **Exception (Ivan, 2026-11-06):** Under the hood folds its height (`grid-template-rows` 1fr → 0fr, 320 ms) when it closes; fading only its picture made the page jump. One element, on a click; the lint disable at that line names the reason. Any other size animation needs Ivan's OK. `[review]`
- `@media (prefers-reduced-motion: reduce)`: animations are removed or reduced to opacity fades ≤ the shortest duration token. `[review]` `[test]` (e2e with `reducedMotion: 'reduce'`)
- Scroll-driven animations only inside `@supports (animation-timeline: view())` / `scroll()`. View Transitions only via `@view-transition` and `if (document.startViewTransition)`. The page is fully usable without them. `[review]`
- JS animation libraries (GSAP, Motion / Framer Motion, anime.js, Lottie) are forbidden. `[lint]` (ESLint `no-restricted-imports`)

## Performance
- **Gradient borders:** `border: 1px solid transparent` + `background-image` + `background-origin: border-box` + `background-clip: padding-box, border-box`. Never via `mask`. `[review]`
- Avoid `mask`, `filter`, `backdrop-filter` and `background-blend-mode` on repeated elements. Each use needs a comment justifying it. `[review]`

## Print
- Print styles (`@media print`) for `/cv`:
  - always the Full version;
  - no navigation, theme toggle, mode switcher, "Ask about this" links or backgrounds;
  - black text on white;
  - links show their URL where useful.

  `[test]` (print visual snapshot + PDF build)
