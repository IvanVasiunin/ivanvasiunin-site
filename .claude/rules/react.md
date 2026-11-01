---
paths:
  - "apps/web/src/**/*.tsx"
---

# React (islands)

Verification tags: `[lint]` ESLint, `[test]` automated test, `[review]` review only.

## Components
- Only function components and hooks. Class components are forbidden, with one exception: the single `ErrorBoundary` component. React has no hook API for error boundaries, so that file carries an ESLint disable comment with a reason. `[lint]` (`no-restricted-syntax` for `extends Component` / `PureComponent`)
- **A component is a folder:**

  ```
  Component/
    Component.tsx
    Component.scss
    Component.test.tsx
    index.ts
  ```

  `index.ts` re-exports by name. `[review]`
- Props are typed with an `interface ComponentProps`, never with `React.FC`. `[lint]` (`@typescript-eslint/consistent-type-definitions: interface`) `[review]`
- Rules of Hooks. Exhaustive dependencies. `[lint]` (eslint-plugin-react-hooks `rules-of-hooks`, `exhaustive-deps` as error)
- **Inline styles** are forbidden, except passing dynamic values as CSS custom properties: `style={{ '--relevance': score }}`. `[lint]` (custom `no-restricted-syntax` on `style` objects with non-`--` keys) `[review]`
- No `dangerouslySetInnerHTML`. `[lint]` (`react/no-danger`)

## State
- State is local (`useState` / `useReducer`). A global store (Redux, Zustand, Context-as-store) needs a documented reason. `[review]`
- Islands talk to each other through DOM `CustomEvent`s (`vector-space:highlight`), typed in one shared module. `[review]`

## Effects and streaming
- Every effect that subscribes, sets a timer, observes or fetches has a cleanup. `[review]` `[test]` (unmount tests)
- The chat stream uses `fetch` with an `AbortController`. Stop calls `abort()`; unmount aborts too. `[test]`
- No state updates after abort or unmount (guarded by the abort signal). `[test]`

## Safety and behaviour
- Model output is rendered with `react-markdown` + `rehype-sanitize`. No `rehype-raw`, no raw HTML. Links get `rel="noopener noreferrer"` and open in a new tab only if they are external. `[test]` (an XSS payload test: `<img onerror>`, `javascript:` links, `<script>`)
- **"Ask about this"** (`/?q=`): fill the input and focus it. **Never send automatically.** `[test]` (Vitest + e2e asserting no `/api/chat` request)
- Example questions fill the input; they do not send. `[test]`
- Error boundaries wrap the chat island and the visualization island separately. A crash in one leaves the other and the page usable. `[test]`

## Accessibility in components
- Keyboard: Enter sends, Shift+Enter inserts a newline; IME composition (`isComposing`) never sends. `[test]`
- Component tests cover every state:
  - default;
  - focus;
  - disabled;
  - loading;
  - error;
  - empty.

  `[test]`
