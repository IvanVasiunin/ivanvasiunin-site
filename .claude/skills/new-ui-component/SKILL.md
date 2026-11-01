---
name: new-ui-component
description: Procedure for creating a new UI component in apps/web (Astro or React island) — semantics, all interaction states, design tokens, transitions, reduced motion, accessibility, mobile, and its test. Use whenever a new component is added.
argument-hint: "<ComponentName> [astro|react]"
---

# New UI component

Rules: `.claude/rules/{html-a11y,css-scss,typescript,react,mobile-performance}.md`.

1. **Decide the type.**
   - **Astro component (default):** static markup, zero JS.
   - **React island:** only if it needs client state. Justify the choice in the step report.
2. **Folder.**
   - React: `src/components/Name/{Name.tsx, Name.scss, Name.test.tsx, index.ts}` (named exports).
   - Astro: `src/components/Name/{Name.astro, Name.scss}`.
3. **Semantics first.** Write the HTML structure before any styles:
   - landmarks and headings;
   - `<a>` for navigation, `<button>` for actions;
   - labels and accessible names;
   - ARIA only where a native element is not enough.
4. **BEM block** `.name` with elements and modifiers. State goes in ARIA / data attributes.
5. **Tokens only.** Use colours, spacing, type, radii, shadows, durations, easings and z-index from tokens. Add a new token instead of a magic number.
6. **States.** Style every applicable one:
   - default;
   - `:hover` inside `@media (hover: hover)`;
   - `:focus-visible`;
   - `:active`;
   - `:disabled` / `[aria-disabled]`;
   - loading (`[aria-busy]`);
   - error;
   - empty.
7. **Motion.** `transition` on explicit `transform` / `opacity` with the duration and easing tokens, plus a `prefers-reduced-motion` override.
8. **Mobile-first.**
   - Base styles at 360 px.
   - Touch targets ≥ 44 px.
   - No hover-only features.
   - Logical properties.
   - Container queries if the layout depends on the container.
9. **Tests.**
   - React: Vitest + Testing Library for every state and for keyboard interaction.
   - Astro: an e2e assertion + axe.
   - Add the component to the visual snapshot set if it is visible on a key screen.
10. **Run** the `run-checks` skill, then **`frontend-reviewer`**, then the `step-report`.
