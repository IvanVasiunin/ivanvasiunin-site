import { afterEach, describe, expect, test, vi } from 'vitest';

import { HISTORY_STORAGE_KEY } from './history';
import { RESTORING_ATTRIBUTE, chatRestoringHeadScript, clearRestoring } from './restoring';
import { SCROLL_ANCHOR_STORAGE_KEY } from './scroll-anchor';

const root = document.documentElement;

/** Pretends the page was opened by `type` (jsdom has no Navigation Timing entry). */
function navigatedBy(type: string): void {
  const entry = { type } as unknown as PerformanceEntry;
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([entry]);
}

function runHeadScript(): void {
  // Runs the exact serialized source the head script ships: it fails if the serialized function
  // references anything outside its own arguments (same approach as lib/cv/view-mode.test.ts).
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- executes the inline head script's own source, built from this module's functions
  const headScript = new Function(chatRestoringHeadScript()) as () => void;
  headScript();
}

describe('chatRestoringHeadScript', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    root.removeAttribute(RESTORING_ATTRIBUTE);
    vi.restoreAllMocks();
  });

  test('a reload starts a new chat: the conversation and its position are forgotten', () => {
    window.sessionStorage.setItem(HISTORY_STORAGE_KEY, '[]');
    window.sessionStorage.setItem(SCROLL_ANCHOR_STORAGE_KEY, '{}');
    navigatedBy('reload');

    runHeadScript();

    expect(window.sessionStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(SCROLL_ANCHOR_STORAGE_KEY)).toBeNull();
    expect(root.hasAttribute(RESTORING_ATTRIBUTE)).toBe(false);
  });

  test.each(['navigate', 'back_forward'])('a %s keeps the conversation', (type) => {
    window.sessionStorage.setItem(HISTORY_STORAGE_KEY, '[]');
    navigatedBy(type);

    runHeadScript();

    expect(window.sessionStorage.getItem(HISTORY_STORAGE_KEY)).toBe('[]');
    expect(root.hasAttribute(RESTORING_ATTRIBUTE)).toBe(true);
  });

  test('marks <html> when the tab keeps a conversation', () => {
    window.sessionStorage.setItem(HISTORY_STORAGE_KEY, '[]');

    runHeadScript();

    expect(root.hasAttribute(RESTORING_ATTRIBUTE)).toBe(true);
  });

  test('leaves <html> alone in a new tab', () => {
    runHeadScript();

    expect(root.hasAttribute(RESTORING_ATTRIBUTE)).toBe(false);
  });

  test('uses the same storage keys as the chat history and its reading position', () => {
    // The serialized function repeats the keys as literals; this keeps them in step.
    expect(chatRestoringHeadScript()).toContain(HISTORY_STORAGE_KEY);
    expect(chatRestoringHeadScript()).toContain(SCROLL_ANCHOR_STORAGE_KEY);
  });

  test('clearRestoring lets the topic cards show again', () => {
    root.setAttribute(RESTORING_ATTRIBUTE, '');

    clearRestoring(root);

    expect(root.hasAttribute(RESTORING_ATTRIBUTE)).toBe(false);
  });
});
