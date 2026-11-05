import { afterEach, describe, expect, test } from 'vitest';

import { HISTORY_STORAGE_KEY } from './history';
import { RESTORING_ATTRIBUTE, chatRestoringHeadScript, clearRestoring } from './restoring';

const root = document.documentElement;

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

  test('uses the same storage key as the chat history', () => {
    // The serialized function repeats the key as a literal; this keeps the two in step.
    expect(chatRestoringHeadScript()).toContain(HISTORY_STORAGE_KEY);
  });

  test('clearRestoring lets the topic cards show again', () => {
    root.setAttribute(RESTORING_ATTRIBUTE, '');

    clearRestoring(root);

    expect(root.hasAttribute(RESTORING_ATTRIBUTE)).toBe(false);
  });
});
