// CSS custom properties in React's `style` prop (react.md: inline styles only pass dynamic values as
// custom properties, e.g. `style={{ '--relevance': 0.8 }}`). React's types know only standard CSS
// properties; this lets any `--name` through with a string or number value, and nothing else.
import 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style -- declaration merging needs an interface; a type alias would replace React's CSSProperties instead of extending it
  interface CSSProperties {
    [property: `--${string}`]: string | number;
  }
}
