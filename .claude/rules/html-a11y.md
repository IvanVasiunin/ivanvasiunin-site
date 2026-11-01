---
paths:
  - "apps/web/src/**/*.{astro,tsx,html}"
---

# HTML, semantics, accessibility

Verification tags: `[lint]` ESLint / Stylelint, `[hook]` Claude Code hook, `[test]` automated test, `[settings]` Claude Code settings, `[review]` review only.

## Structure
- Use landmarks: `header`, `nav`, `main` (exactly one per page), `section` with a heading, `article`, `aside`, `footer`. `[test]` (axe `region`, `landmark-one-main`)
- Exactly one `h1` per page; heading levels never skip (h2 → h4 is forbidden). `[test]` (axe `heading-order`, `page-has-heading-one`)
- `<html lang="en">` on every page. Content in another language gets its own `lang` attribute. `[test]`
- Every page has `<title>`, `meta description`, canonical URL and OG / Twitter tags. `/cv` also embeds JSON-LD `Person`. `[test]`
- Lists of things are `ul` / `ol`; key-value pairs are `dl`; dates are `<time datetime>`. `[review]`

## Interactive elements
- Navigation is `<a href>`, actions are `<button type="button">`. Clickable `div` / `span`, `onClick` on non-interactive elements, and `href="#"` / `javascript:` links are forbidden. `[lint]` (jsx-a11y-x `no-static-element-interactions`, `click-events-have-key-events`, `anchor-is-valid`; astro equivalents)
- Do not add ARIA roles where a native element exists (`<button>`, not `role="button"`). `[lint]` (`jsx-a11y-x/prefer-tag-over-role`, `astro/jsx-a11y/prefer-tag-over-role`) `[review]`
- **Mode switcher:** `<nav aria-label="Mode">` with two links; the active link has `aria-current="page"`. It is **not** a WAI-ARIA tablist (SPEC §2). `[test]`
- **Brief / Full:** two `<button>`s with `aria-pressed`. The state is reflected in `?view=`. Without JS, the Full view is shown. `[test]`
- **Under the hood:** a `<button aria-expanded aria-controls>` toggles a region. It works with Enter / Space, and focus stays on the button. `[test]`
- Every form control has a visible `<label>` or `aria-label`. The chat textarea has a label (visually hidden is allowed). `[lint]` (`label-has-associated-control`) `[test]`
- Icon-only buttons have an accessible name (`aria-label` or visually hidden text). `[lint]` `[test]`
- Focus order follows visual order. No positive `tabindex`. `[lint]` (`tabindex-no-positive`)
- After a route change or a dialog closes, focus goes to a sensible target (main heading or trigger). `[review]`

## Live regions
- Streaming tokens are **not** announced. The completed answer is announced once via an `aria-live="polite"` region. Status messages ("Copied", "Stopped") use the same region. `[test]`
- Error messages use `role="alert"` only for blocking errors. `[review]`

## Media
- Every `img` has `alt` (decorative images: `alt=""`) and explicit `width` / `height` to prevent CLS. `[lint]` (`alt-text`) `[test]` (CLS budget)
- Decorative SVG (the vector-space map, icons next to text) has `aria-hidden="true"` and `focusable="false"`. `[review]`

## Contrast and visibility
- WCAG 2.2 AA:
  - text contrast ≥ 4.5:1 (≥ 3:1 for large text);
  - UI components and focus indicators ≥ 3:1;

  in **both** themes. `[test]` (axe `color-contrast` in e2e for light and dark)
- Focus is always visible (see css-scss rule). Target size ≥ 44×44 px for touch. `[review]` `[test]` (e2e size assertion on primary controls)
- Zero axe violations of impact serious / critical on every screen. `[test]`
