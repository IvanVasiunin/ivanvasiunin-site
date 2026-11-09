# Styles

Global styles for `apps/web`. Component styles live next to their components, inside `@layer components`.
Rules: [`.claude/rules/css-scss.md`](../../../../.claude/rules/css-scss.md).

| File          | Layer    | Purpose                                                              |
| ------------- | -------- | -------------------------------------------------------------------- |
| `global.scss` | —        | Entry. Declares `@layer reset, base, tokens, components, utilities;` |
| `reset.scss`  | `reset`  | Minimal reset, zero specificity via `:where()`                       |
| `tokens.scss` | `tokens` | Design tokens as CSS custom properties, both themes                  |
| `base.scss`   | `base`   | Element defaults (body, headings, links, focus ring, selection)      |
| `mixins.scss` | —        | Build-time only: `mq(sm \| md \| lg \| xl)`, `gradient-border()`     |

## Visual direction: "Celestial atlas"

The vector space is a star chart of Ivan's experience. The chat sits on the chart; the source-type
legend reads like a chart key. Warm star-chart paper and navy ink in light, deep space in dark, a cobalt
accent, star gold for relevance. The chart is the one bold element; everything else stays quiet.

## Themes

- Light values live on `:root`. Dark values are one Sass mixin, applied under `:root[data-theme='dark']`
  and under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme='light'])`.
- Without JS (or with no stored choice) the system preference wins.
- The toggle (`src/components/ThemeToggle/`) switches between light and dark; the choice is stored in
  `localStorage['theme']`. There is no "System" option: before the first choice the system theme applies.
  An inline blocking script in `<head>` (BaseLayout) applies it before first paint: it sets `data-theme`
  (none without a choice) and syncs the `theme-color` / `color-scheme` metas. Its source is the pair of
  self-contained functions in `src/lib/theme/theme.ts`, serialized at build time, so the head script and
  the toggle share one tested implementation.
- Components that depend on the theme choice (not just on colours) may key on
  `:root[data-theme='light' | 'dark']` / `:root:not([data-theme])` (allowed by the Stylelint BEM config).
- `e2e/tokens.spec.ts` checks that both themes resolve and that the contrast below holds;
  `e2e/theme.spec.ts` covers the toggle, persistence, no flash, other tabs, blocked storage and no JS.

## Colour

Text tokens reach 4.5:1 and graphic tokens 3:1 on `bg`, on `surface` and on `bg` under all three
nebulae at once (the worst case; tested). The accent is < 3:1 against body text, so links inside running
text keep a resting underline (WCAG 1.4.1).

## Backdrop, gradients, glow

- Header scrim: `--color-scrim` (page colour at 55%) over a `--blur-scrim` 8px blur, only around the bar (its width plus 24 px soft side fades, from the top of the screen to 24 px below the bar), never across the whole page. Invisible at the top of the page and on pages too short to scroll (a tint over the bare backdrop read as a flat stripe); it fades in gradually over the first `--distance-scrim-fade` (160 px) of scrolling via a scroll-driven animation (always on where those are unsupported). Without `backdrop-filter` support or with `prefers-reduced-transparency: reduce`: `--color-scrim-solid` (92%), no blur.

- `src/components/Backdrop/` draws the sky behind every page: nebula glows and a star-chart dot grid in
  CSS, two star layers (coprime tile sizes, generated at build time by `src/lib/backdrop/stars.ts`) and a
  celestial chart fragment in inline SVG. One fixed, static layer at `--z-backdrop`; no JS; hidden in print.
- `--gradient-accent` (accent → accent-2) for primary buttons and active controls, with
  `--color-on-accent` text. `--gradient-border` (accent → accent-2 → accent-3) for framed blocks.
- `@include gradient-border($fill, $border, $width)` from `mixins.scss`: the border-box technique from the
  rules (transparent border + two background layers), never `mask`.
- `--shadow-glow`: accent glow for primary controls and focused panels.
- Button states (see `src/components/Button/`): gradient fill + gradient border on the element; hover is a
  `::before` layer (`--gradient-accent-hover` / `--gradient-surface-hover` + glow), active is an `::after`
  layer (`--gradient-accent-active` / `--gradient-surface-active`). Only their opacity transitions; nothing
  moves. `--color-accent-active` / `--color-accent-2-active` keep `--color-on-accent` at ≥ 4.5:1 (tested).
- `--color-highlight-soft` / `--color-highlight-strong`: translucent accent washes for hover / pressed
  highlights on icon-like controls (header brand, theme toggle).

## Cursors

`public/cursors/{arrow,pointer,text}.svg`: the familiar arrow, hand and I-beam in the site's gradient, with
a white outline for both themes. Applied in `base.scss` only under `(hover: hover) and (pointer: fine)`,
each with the native keyword as fallback.

| Token                       | Light     | Dark      | Use                                                                                  |
| --------------------------- | --------- | --------- | ------------------------------------------------------------------------------------ |
| `--color-bg`                | `#f4efe5` | `#0e1430` | Page background (warm chart paper / space)                                           |
| `--color-surface`           | `#fcf9f3` | `#161e40` | Raised panels, chat input                                                            |
| `--color-text`              | `#182036` | `#dde4f5` | Body text (navy ink)                                                                 |
| `--color-text-muted`        | `#454a62` | `#a3aecb` | Secondary text                                                                       |
| `--color-grid`              | `#d8cfbf` | `#232c52` | Decorative lines only (no contrast floor)                                            |
| `--color-border`            | `#5f6274` | `#7c88b0` | UI boundaries (inputs, toggles)                                                      |
| `--color-accent`            | `#2b54b0` | `#8db2ff` | Links, primary actions (cobalt)                                                      |
| `--color-accent-2`          | `#6a4fb0` | `#bba6ff` | Second gradient stop (violet)                                                        |
| `--color-accent-3`          | `#1f7373` | `#6ed3c8` | Third gradient stop (teal)                                                           |
| `--color-on-accent`         | `#fff`    | `#0e1430` | Text on accent gradients (≥ 4.5:1, tested)                                           |
| `--color-focus`             | `#2b54b0` | `#8db2ff` | Focus ring                                                                           |
| `--color-highlight`         | `#8f5d00` | `#f2c14e` | Relevance highlight on the map (star gold)                                           |
| `--color-glow-1…3`          | pastels   | deep hues | Backdrop nebulae (translucent)                                                       |
| `--color-star`              | `#4a5a8a` | `#e6ecff` | Backdrop stars                                                                       |
| `--color-chart-line`        | `#7d8ab0` | `#5a6cb0` | Backdrop celestial chart (decoration)                                                |
| `--color-source-cv`         | `#2b54b0` | `#8db2ff` | Map key: CV                                                                          |
| `--color-source-experience` | `#1f7373` | `#6ed3c8` | Map key: experience notes                                                            |
| `--color-source-personal`   | `#a6466e` | `#f29ac0` | Map key: personal facts                                                              |
| `--color-source-site-docs`  | `#6a4fb0` | `#bba6ff` | Map key: site docs                                                                   |
| `--color-source-github`     | `#5b6478` | `#a9b3cc` | Map key: GitHub READMEs                                                              |
| `--color-map-*`             | dark      | dark      | Knowledge map sky, text and stars: the same "night window" in both themes (ADR-0012) |

## Typography

- `--font-sans`: Schibsted Grotesk (UI, headings). `--font-serif`: Newsreader (Elio's answers, CV prose).
  Self-hosted OFL fonts via the Astro Fonts API (`astro.config.mjs`, `docs/CREDITS.md`); only the UI face
  is preloaded. Coverage: the UI face has Latin, the serif Latin and Latin Extended. Neither family has
  Cyrillic, so Russian text (and symbols outside the subsets, such as →) uses the system fonts.
- Type scale after _The Elements of Typographic Style_ (12 14 16 18 21 24 36 48 px), in `rem`:
  `--font-size-xs` 0.75 · `sm` 0.875 · `md` 1 · `lg` 1.125 · `xl` 1.3125→1.5 · `2xl` 1.5→2.25 ·
  `3xl` 2→3 (fluid steps use `clamp()` with `rem` bounds).
- Line heights: `--line-height-tight` 1.1 (display), `snug` 1.3 (headings), `body` 1.5 (sans),
  `prose` 1.4 (serif, the CV), `chat` 1.25 (chat questions and answers, 18 px). Weights: `--font-weight-regular | medium | bold`. Measure: `--measure` 65ch. Tracking: `--letter-spacing-caps` 0.08em (small uppercase labels).

## Spacing, shape, motion, layering

| Group      | Tokens                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing    | `--space-3xs` 2px · `2xs` 4 · `xs` 8 · `sm` 12 · `md` 16 · `lg` 24 · `xl` 32 · `2xl` 48 · `3xl` 64 · `4xl` 96                                                                                                                                                  |
| Gutter     | `--gutter`: 16px, 32px from `md`                                                                                                                                                                                                                               |
| Sizes      | `--size-touch` 44px · `--size-container` 75rem · `--size-cv` 56rem (CV width) · `--size-cv-rail` 7.5rem (CV date rail from `md`) · `--size-cv-star` 8px (timeline star) · `--size-meter` 3rem × `--size-meter-thickness` 4px (relevance bar in Under the hood) |
| Radius     | `--radius-sm` 4px (chips, inputs) · `md` 8px (panels) · `pill` (toggles)                                                                                                                                                                                       |
| Lines      | `--border-width` 1px · `--focus-ring-width` 2px                                                                                                                                                                                                                |
| Shadow     | `--shadow-raised` (ink-tinted in light, deeper in dark)                                                                                                                                                                                                        |
| Duration   | `--duration-fast` 120ms · `base` 200ms · `slow` 320ms; all collapse to `fast` under reduced motion                                                                                                                                                             |
| Easing     | `--ease-out`, `--ease-in-out`                                                                                                                                                                                                                                  |
| Z-index    | `--z-backdrop` −2 · `map` −1 · `base` 0 · `raised` 10 · `header` 100 · `overlay` 200 · `toast` 300 · `skip-link` 400                                                                                                                                           |
| Breakpoint | Sass `mq()`: `sm` 480 · `md` 768 · `lg` 1024 · `xl` 1440 (px, `min-width`)                                                                                                                                                                                     |

## Scroll motion and page transitions (ROADMAP 2.6)

All of it animates `transform` / `opacity` only, sits behind `@supports (animation-timeline: …)` (e2e checks every such rule) and is screen-only; browsers without scroll-driven animations get the static, fully drawn page.

- `scroll-motion` mixin: `@supports` + `@media screen and (prefers-reduced-motion: no-preference)`.
- `reveal-on-scroll` mixin: section titles, jobs, project cards, skill groups and records fade in and rise `--distance-reveal` (12 px) as they enter the viewport; anything on the first screen starts in its final state.
- CV timeline: the meridian is drawn down to `--timeline-draw-line` (65% of the viewport height) while scrolling; each job's star lights up when the line reaches it, and a comet (white-hot head, gold coma, tapered tail up the line) rides the line's tip.
- "Back to top" (`ScrollTop`): the rocket itself is the control (no frame; 27 px wide, 37 px from `md`, in a 44 px touch target), standing in the bottom corner (beside the mobile mode switch, level with it from 24em; above it on narrower screens) after 40–60% of a screen of scrolling. Hovered or focused, its engine idles. A click launches it like a real rocket: ignition on the pad (`--duration-ignition`: flame builds, smoke billows, the rocket shudders), then a slow lift-off that accelerates (progress^2.6), with the page scrolling up on the same curve; it fades out over the last 30% of its way to the top edge. Driven frame by frame (`requestAnimationFrame`, transform / opacity), because the page has to follow it; a wheel or touch hands the scroll back to the reader. Reduced motion: an instant jump. Without JS: a plain `#top` link. Its materials (silver hull, machined metal, flame) are theme-independent tokens; the livery follows the accent.
- Page scrollbar (fine pointers only): a gradient pill thumb on a transparent track in Chromium / Safari (`::-webkit-scrollbar`); Firefox gets `scrollbar-color` (accent thumb).
- Mode switch: only the pill slides to the new tab (its own view-transition group, with each tab label above it); the page itself swaps at once, with no fade or movement (Ivan, 2026-11-05: the content lifting out and rising in looked jerky).
- Always longhands for `animation-*` next to `animation-timeline`: the minifier folds them into the `animation` shorthand, where browsers reject a timeline.

## Icons

"Frosted glass" (chosen by Ivan, 2026-11-03): the mode-switch and theme-toggle icons are glass shapes on one 24 px grid, a two-stop gradient fill (`--color-icon-glass-1/2`), a white sheen on the upper half, a white rim and the detail (chat dots, text lines) cut into the glass. The light theme uses a deeper glass so the icons read on the paper; on the current mode's accent pill the glass switches to its on-accent variant (pale in light, deep in dark). The theme toggle's sun (`--color-sun-*`, with a `--color-sun-edge` outline for 3:1 on the light bar) and moon (`--color-moon-*`, with a gold star) follow the same recipe. Forced colours: solid system-coloured glyphs.

## Print

`/cv` on paper and the build-time PDF (`scripts/build-pdf.mjs`, ROADMAP 2.5) share the same print styles:

- A4, `@page` margins 12 / 14 mm; the root font size drops to `--font-size-root-print` (13 px), so every `rem` size follows.
- Always light and ink on paper: the dark tokens apply only under `@media screen`; a print token block sets black text on white and a dark ink-blue accent.
- Always the Full view; the header, footer, skip link, backdrop, Brief / Full switch and PDF link are hidden.
- Backgrounds and shadows drop out; the timeline meridian and section hairlines keep printing (`print-color-adjust: exact`), tags and project cards get plain hairline borders.
- Links that cannot be followed on paper print their address (LinkedIn, project links), via print-only spans.
- `mq($name, $print: true)` applies a breakpoint layout in print too: an A4 page is ~680 px wide, so the CV date rail opts in.
