// The `?q=` prefill (SPEC §2, US-T3 "Ask about this"): the question from the URL goes into the input,
// and is never sent automatically. The URL is untrusted input (typescript.md): control characters are
// dropped and the text is cut to the input's limit.
import { MAX_QUESTION_CHARS } from './state';

// Control characters (Unicode category Cc) except tab and line feed.
const CONTROL_CHARS = /[^\P{Cc}\t\n]/gu;

/** The question in `?q=`, cleaned, or null when there is none. */
export function questionFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('q');
  if (raw === null) return null;
  // Cut in UTF-16 units, the same way the textarea's `maxlength` counts.
  const text = raw.replace(CONTROL_CHARS, '').trim().slice(0, MAX_QUESTION_CHARS);
  return text === '' ? null : text;
}
