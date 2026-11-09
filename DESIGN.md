---
name: ivanvasiunin.com
description: The personal site of Ivan Vasiunin as a celestial atlas — warm chart paper by day, deep space by night.
colors:
  chart-paper: "#f4efe5"
  paper-surface: "#fcf9f3"
  navy-ink: "#182036"
  muted-ink: "#454a62"
  hairline-ink: "#5f6274"
  cobalt: "#2b54b0"
  violet: "#6a4fb0"
  teal: "#1f7373"
  star-gold: "#8f5d00"
  danger-red: "#922720"
  deep-space: "#0e1430"
  night-surface: "#161e40"
  starlight-text: "#dde4f5"
  starlight-muted: "#a3aecb"
  night-cobalt: "#8db2ff"
  night-violet: "#bba6ff"
  night-teal: "#6ed3c8"
  night-gold: "#f2c14e"
  map-sky: "#0a0f26"
typography:
  display:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.6rem + 1.5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1.3125rem, 1.2rem + 0.5vw, 1.5rem)"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  prose:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  sm: "4px"
  md: "8px"
  bubble: "20px"
  input-pill: "24px"
  panel: "24px"
  pill: "999px"
spacing:
  3xs: "2px"
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
components:
  tag:
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  button-primary:
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "44px"
  chat-input:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.input-pill}"
  card:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: ivanvasiunin.com

Source of truth for values: `apps/web/src/styles/tokens.scss` (both themes) and `styles/README.md`. This file describes them for design work; when they differ, the tokens win. Binding implementation rules: `.claude/rules/css-scss.md`, `html-a11y.md`, `visualization.md`, `mobile-performance.md`.

## Overview

**Creative North Star: "The Celestial Atlas"**

The site is a star chart of Ivan's experience. Every source Elio can read is a star on the knowledge map; the legend reads like a chart key. By day the page is warm chart paper printed in navy ink with a cobalt accent; by night it is deep space with starlight text. A patterned backdrop (dot grid, faint stars, chart rings, soft nebulae) sits behind everything, dimmed behind content.

The atlas is rich, not flat: gradients run from cobalt to violet to teal, primary controls glow softly, panels carry gradient hairline borders, and small objects (Elio's robot avatar, the reticle logo with its orbiting planet, the "back to top" rocket, the frosted-glass icons) have their own materials. The knowledge map is the one bold element and a "night window": its sky is dark in both themes. Text stays calm: a sans for the interface, a serif for reading.

Content comes first. The recruiter's path through `/cv` must stay fast and legible; ornament never sits between the reader and the text.

**Key Characteristics:**
- Warm paper and navy ink by day, deep space by night; both themes are complete, never an inverted copy.
- One accent family (cobalt → violet → teal) used as gradients, never as flat blocks of colour.
- Gold is reserved for stars: relevance, the current job, the logo's planet, the comet on the CV timeline.
- Depth from soft shadows plus accent glows on primary and focused controls.
- Motion is small and physical (orbits, a comet, an ignition on the map), transform and opacity only, and off under reduced motion.

## Colors

A warm-paper / deep-space pair with a single cool accent family and star gold.

### Primary
- **Cobalt Ink** (cobalt; night: night-cobalt): links, primary actions, focus rings, the CV source on the map. Below 3:1 against body text, so links inside running text keep an underline.

### Secondary
- **Nebula Violet** (violet; night: night-violet): the second stop of every accent gradient; site docs on the map.

### Tertiary
- **Chart Teal** (teal; night: night-teal): the third gradient stop; experience notes on the map.

### Neutral
- **Chart Paper** (chart-paper) / **Deep Space** (deep-space): page background.
- **Paper Surface** (paper-surface) / **Night Surface** (night-surface): cards, panels, the chat input.
- **Navy Ink** (navy-ink) / **Starlight** (starlight-text): body text.
- **Muted Ink** (muted-ink) / **Starlight Muted** (starlight-muted): dates, meta, captions (≥ 4.5:1).
- **Hairline Ink** (hairline-ink): UI boundaries (≥ 3:1).
- **Star Gold** (star-gold; night: night-gold): relevance and "current" highlights; graphic, not text.
- **Danger Red** (danger-red): chat errors only.

### Named Rules
**The Star Gold Rule.** Gold means "a star": relevance, the current job, the logo's planet. Never a button, never a heading colour.
**The Contrast-Under-Nebulae Rule.** Text tokens keep 4.5:1 on the background even where all three nebulae overlap (tested in `e2e/tokens.spec.ts`).

## Typography

**Display Font:** Schibsted Grotesk (with system-ui)
**Body Font:** Schibsted Grotesk for the interface; Newsreader (with Georgia) for reading text
**Label Font:** Schibsted Grotesk, small caps-style uppercase labels

**Character:** a sturdy newspaper grotesk for structure and controls, paired with a warm editorial serif for Elio's answers and the CV prose, so long text reads like a well-set page.

### Hierarchy
- **Display** (700, 2–3rem fluid, 1.1): the page h1 (the name on `/cv`).
- **Headline** (700, 1.5–2.25rem fluid, 1.3): section headings.
- **Title** (700, 1.3125–1.5rem fluid, 1.3): job and project names.
- **Body** (400, 1rem, 1.5): interface text.
- **Prose** (400, 1rem, 1.4, max 65ch): Elio's answers and CV text.
- **Label** (500, 0.75rem, 0.08em, uppercase): kinds and categories ("Study project").

### Named Rules
**The Two Voices Rule.** Sans speaks for the interface, serif for the content. A paragraph someone reads to learn about Ivan is serif.

## Layout

Mobile-first from 360px. A centred frame up to 75rem with a 16px gutter that widens from `md`. Reading columns hold a 65ch measure: the CV is 56rem wide with a 7.5rem date rail on the left from `md`; the chat column is 46rem. AI mode on desktop (≥ 80rem) places the knowledge-map card to the right of the chat; phones never load the map. On small screens the mode switch floats at the bottom within thumb reach; the input stays above the virtual keyboard. Spacing follows a 4px grid (tokens `--space-*`).

## Elevation & Depth

A hybrid: surfaces are lifted by a soft two-layer shadow, and primary or focused controls add an accent glow. Print drops all shadows and glows.

### Shadow Vocabulary
- **Raised** (`--shadow-raised`): cards and panels.
- **Glow** (`--shadow-glow`): primary buttons and focused panels; follows the accent.
- **Raised glow** (`--shadow-raised-glow`): the focused chat input.
- **Small glow** (`--shadow-glow-sm`): the active mode-switch pill inside its bar.
- **Track** (`--shadow-track`): the inset hairline of a segmented control.

### Named Rules
**The Earned Glow Rule.** A glow marks something you can act on or something in focus. Static text and decoration never glow.

## Shapes

Gently rounded panels (8px), small radii on tags and inputs (4px), pills for toggles and buttons, a 24px pill for the growing chat input and chat panels, 20px chat bubbles with a tighter "tail" corner on the speaker's side. Borders are 1px hairlines; panels get gradient hairline borders (border + `background-clip`, never `mask`).

## Components

### Buttons
- **Shape:** pill, at least 44px tall.
- **Primary:** cobalt-to-violet gradient fill, white text, accent glow; hover reverses the gradient, active deepens it (state layers animate opacity only).
- **Secondary:** gradient hairline border on the surface gradient.

### Chips (tags)
- **Style:** small rounded rectangles (4px) with a hairline border on the surface; stack lists on the CV and in projects. Not interactive.

### Cards / Containers
- **Corner Style:** 8px (project cards), 24px (chat panel, knowledge-map card).
- **Background:** the surface gradient; the knowledge map is a dark "night window" in both themes.
- **Shadow Strategy:** Raised; gradient hairline border.
- **Internal Padding:** 24px (16px in print).

### Inputs / Fields
- **Style:** the chat input is a pill on the surface that grows up to about six lines; computed font size ≥ 16px.
- **Focus:** raised glow plus the focus ring.
- **Error / Disabled:** errors in a panel with a faint danger tint; disabled is a native `disabled` state.

### Navigation
- **Mode switch:** two links (AI mode / CV) in a tinted track with a sliding glowing pill (cross-document View Transitions); centred in the header from `md`, a floating bottom bar below it. Icons are frosted-glass glyphs; the AI mode icon is a chat bubble.
- **Links:** no underline at rest, underline on hover and focus; links inside prose keep a resting underline.

### Knowledge Map (signature)
A framed "night window" card beside the chat on desktop: chunk stars coloured by source type, a legend, and an ignition of the stars Elio read for an answer (Canvas 2D, ADR-0012). Light mode on weak devices shows the final state at once.

### Elio's Avatar (signature)
A small polished-metal robot with a dark glass visor and teal eyes; idle breathing and blinking, faster only while an answer is being prepared.

### CV Timeline (signature)
A gradient meridian with a star per job (gold for the current one); on scroll, where supported, the line is drawn down with a comet at its tip.

## Do's and Don'ts

### Do:
- **Do** take every colour, size, radius, shadow, duration and easing from the tokens in `tokens.scss`.
- **Do** keep text at 4.5:1 and UI parts at 3:1 in both themes, including over the nebulae.
- **Do** animate only `transform` and `opacity`, and remove or reduce motion under `prefers-reduced-motion`.
- **Do** keep touch targets at 44px and `:hover` styles inside `@media (hover: hover)`.
- **Do** keep the CV printable: Full view, black on white, no backdrop or controls.

### Don't:
- **Don't** use AI-sparkle icons (four-point stars, "magic" glyphs) anywhere; Ivan rejected them as Gemini-like.
- **Don't** make the interface flat: no plain grey buttons or borderless white cards.
- **Don't** add calls to action from `/cv` into the chat (Ivan dropped "Ask about this").
- **Don't** use `mask`, `filter`, `backdrop-filter` or `background-blend-mode` on repeated elements; never animate blur, mask or size.
- **Don't** use WebGL, shaders or JS animation libraries (GSAP, Motion, Lottie); `overdrive` is banned.
- **Don't** show employer logos.
