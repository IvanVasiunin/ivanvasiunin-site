// While a conversation kept for this tab waits to be restored (lib/chat/history.ts), the empty
// chat's topic cards stay hidden: otherwise they flash for a moment on the way back to AI mode and
// are then replaced by the conversation (Ivan, 2026-11-05). Replacing that tall block right after
// the mode switch's view transition also crashed WebKit under load (e2e, iPhone profile).
//
// A tiny inline head script sets `data-chat-restoring` on <html> before first paint; CSS hides the
// cards (components/ChatWelcome/ChatWelcome.scss). The chat island removes the attribute once the
// conversation is restored, or at once when there is nothing to restore. Without JS the script does
// not run, and the cards (the no-JS page) show.
//
// `markRestoring` is serialized with `Function.prototype.toString()` into the head script, so it
// must stay self-contained: no imports, module constants or other functions (as lib/cv/view-mode.ts).

/** The <html> attribute while a stored conversation waits for its restore. */
export const RESTORING_ATTRIBUTE = 'data-chat-restoring';

/** Marks the root when the tab keeps a conversation (`elio-chat-v1`, HISTORY_STORAGE_KEY). */
export function markRestoring(root: HTMLElement, storage: Pick<Storage, 'getItem'>): void {
  if (storage.getItem('elio-chat-v1') !== null) root.setAttribute('data-chat-restoring', '');
}

/** Lets the topic cards show again (nothing left to restore). */
export function clearRestoring(root: HTMLElement): void {
  root.removeAttribute(RESTORING_ATTRIBUTE);
}

/**
 * Inline <head> script for `/`; its hash goes into the page's CSP (see index.astro). Reading
 * sessionStorage can throw (blocked site data): then nothing is marked and the cards show.
 */
export function chatRestoringHeadScript(): string {
  return `try{(${markRestoring.toString()})(document.documentElement,sessionStorage)}catch(e){}`;
}
