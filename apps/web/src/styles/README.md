# Styles

Global styles for `apps/web`. Component styles live next to their components, inside `@layer components`.
Rules: [`.claude/rules/css-scss.md`](../../../../.claude/rules/css-scss.md).

| File          | Layer    | Purpose                                                                |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `global.scss` | —        | Entry. Declares `@layer reset, base, tokens, components, utilities;`   |
| `reset.scss`  | `reset`  | Minimal reset, zero specificity via `:where()`                         |
| `tokens.scss` | `tokens` | Design tokens as CSS custom properties, both themes                    |
| `base.scss`   | `base`   | Element defaults (body, headings, links, focus ring, selection)        |
| `mixins.scss` | —        | Build-time only: `mq(sm \| md \| lg \| xl)`, `gradient-border()`       |

## Visual direction: "Celestial atlas"

The vector space is a star chart of Ivan's experience. The chat sits on the chart; the source-type
legend reads like a chart key. Star-chart paper and navy ink in light, deep space in dark, a cobalt
accent, star gold for relevance. The chart is the one bold element; everything else stays quiet.

## Themes

- Light values live on `:root`. Dark values are one Sass mixin, applied under `:root[data-theme='dark']`
  and under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme='light'])`.
- Without JS (or with no stored choice) the system preference wins. `data-theme` is set by the theme
  script (ROADMAP 1.1, step 3).
- `e2e/tokens.spec.ts` checks that both themes resolve and that the contrast below holds.

## Colour

Text tokens reach 4.5:1 and graphic tokens 3:1 on `bg`, on `surface` and on `bg` under all three
nebulae at once (the worst case; tested). The accent is < 3:1 against body text, so links inside running
text keep a resting underline (WCAG 1.4.1).

## Backdrop, gradients, glow

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
- `--color-highlight-soft`: a translucent accent wash for hover highlights (header brand).

## Cursors

`public/cursors/{arrow,pointer,text}.svg`: the familiar arrow, hand and I-beam in the site's gradient, with
a white outline for both themes. Applied in `base.scss` only under `(hover: hover) and (pointer: fine)`,
each with the native keyword as fallback.

| Token                       | Light     | Dark      | Use                                         |
| --------------------------- | --------- | --------- | ------------------------------------------- |
| `--color-bg`                | `#e8ecf5` | `#0e1430` | Page background (star-chart paper / space)  |
| `--color-surface`           | `#f5f7fb` | `#161e40` | Raised panels, chat input                   |
| `--color-text`              | `#182036` | `#dde4f5` | Body text (navy ink)                        |
| `--color-text-muted`        | `#4a5470` | `#a3aecb` | Secondary text                              |
| `--color-grid`              | `#bfc7da` | `#232c52` | Decorative lines only (no contrast floor)   |
| `--color-border`            | `#646e8a` | `#7c88b0` | UI boundaries (inputs, toggles)             |
| `--color-accent`            | `#2b54b0` | `#8db2ff` | Links, primary actions (cobalt)             |
| `--color-accent-2`          | `#6a4fb0` | `#bba6ff` | Second gradient stop (violet)               |
| `--color-accent-3`          | `#1f7373` | `#6ed3c8` | Third gradient stop (teal)                  |
| `--color-on-accent`         | `#fff`    | `#0e1430` | Text on accent gradients (≥ 4.5:1, tested)  |
| `--color-focus`             | `#2b54b0` | `#8db2ff` | Focus ring                                  |
| `--color-highlight`         | `#8f5d00` | `#f2c14e` | Relevance highlight on the map (star gold)  |
| `--color-glow-1…3`          | pastels   | deep hues | Backdrop nebulae (translucent)              |
| `--color-star`              | `#4a5a8a` | `#e6ecff` | Backdrop stars                              |
| `--color-chart-line`        | `#7d8ab0` | `#5a6cb0` | Backdrop celestial chart (decoration)       |
| `--color-source-cv`         | `#2b54b0` | `#8db2ff` | Map key: CV                                 |
| `--color-source-experience` | `#1f7373` | `#6ed3c8` | Map key: experience notes                   |
| `--color-source-personal`   | `#a6466e` | `#f29ac0` | Map key: personal facts                     |
| `--color-source-site-docs`  | `#6a4fb0` | `#bba6ff` | Map key: site docs                          |
| `--color-source-github`     | `#5b6478` | `#a9b3cc` | Map key: GitHub READMEs                     |

## Typography

- `--font-sans` (UI, headings) and `--font-serif` (Elio's answers, CV prose) are system stacks until
  ROADMAP 1.3 adds the self-hosted OFL fonts (planned: Schibsted Grotesk, Newsreader).
- Type scale after _The Elements of Typographic Style_ (12 14 16 18 21 24 36 48 px), in `rem`:
  `--font-size-xs` 0.75 · `sm` 0.875 · `md` 1 · `lg` 1.125 · `xl` 1.3125→1.5 · `2xl` 1.5→2.25 ·
  `3xl` 2→3 (fluid steps use `clamp()` with `rem` bounds).
- Line heights: `--line-height-tight` 1.1 (display), `snug` 1.3 (headings), `body` 1.5 (sans),
  `prose` 1.6 (serif). Weights: `--font-weight-regular | medium | bold`. Measure: `--measure` 65ch.

## Spacing, shape, motion, layering

| Group     | Tokens                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Spacing   | `--space-3xs` 2px · `2xs` 4 · `xs` 8 · `sm` 12 · `md` 16 · `lg` 24 · `xl` 32 · `2xl` 48 · `3xl` 64 · `4xl` 96 |
| Gutter    | `--gutter`: 16px, 32px from `md`                                                                           |
| Radius    | `--radius-sm` 4px (chips, inputs) · `md` 8px (panels) · `pill` (toggles)                                   |
| Lines     | `--border-width` 1px · `--focus-ring-width` 2px                                                            |
| Shadow    | `--shadow-raised` (ink-tinted in light, deeper in dark)                                                    |
| Duration  | `--duration-fast` 120ms · `base` 200ms · `slow` 320ms; all collapse to `fast` under reduced motion        |
| Easing    | `--ease-out`, `--ease-in-out`                                                                              |
| Z-index   | `--z-backdrop` −2 · `map` −1 · `base` 0 · `raised` 10 · `header` 100 · `overlay` 200 · `toast` 300 · `skip-link` 400      |
| Breakpoint | Sass `mq()`: `sm` 480 · `md` 768 · `lg` 1024 · `xl` 1440 (px, `min-width`)                               |
