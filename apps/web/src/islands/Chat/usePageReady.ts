// "Ready" = hydrated and shown to the visitor. `/` may be prerendered by speculation rules (ADR-0009)
// before anyone sees it, so the `?q=` prefill and focus wait until `document.prerendering` is false
// (ROADMAP 3.9): focusing an invisible page, or reading a prefill nobody asked for yet, would be
// wrong. Before hydration (the server HTML, or no JS at all) the composer stays disabled.
//
// useSyncExternalStore gives exactly that: the server snapshot (`false`) is used for the server HTML
// and during hydration, then React re-renders with the browser's value.
import { useSyncExternalStore } from 'react';

const isPrerendering = (): boolean =>
  'prerendering' in document && (document as Document & { prerendering: boolean }).prerendering;

function subscribe(onChange: () => void): () => void {
  document.addEventListener('prerenderingchange', onChange);
  return () => {
    document.removeEventListener('prerenderingchange', onChange);
  };
}

const browserSnapshot = (): boolean => !isPrerendering();
const serverSnapshot = (): boolean => false;

export function usePageReady(): boolean {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
}
