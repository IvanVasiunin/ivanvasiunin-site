// The privacy page's masking demo (Ivan's pick, 2026-11-07: variant B): the same patterns as the
// server's `apps/api/src/site_api/services/masking.py`, run in the browser, so a visitor sees what
// the statistics and the traces keep of a question. Nothing typed into the demo is sent anywhere.
//
// The two must agree: both test suites run the shared cases in
// `apps/api/tests/api/masking_cases.json`. A change to masking.py changes this file too.
//
// Python's `\w`, `\b` and `\d` are Unicode-aware; JavaScript's are not, even with the `u` flag. So
// `\p{L}\p{N}_` stands in for `\w`, a lookbehind for `\b` at a match's start, and `\p{Nd}` for `\d`;
// otherwise "иван@пример.рф" would stay unmasked here and be masked on the server.

export type MaskKind = 'email' | 'url' | 'phone';

/** A piece of the masked text: kept as written, or replaced by a placeholder. */
export type MaskPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: MaskKind; readonly text: string };

const WORD = String.raw`\p{L}\p{N}_`;
// Python's `\b` where a match starts: no word character right before it.
const START = String.raw`(?<![${WORD}])`;
const DIGIT = String.raw`\p{Nd}`;
// Characters that end a link inside text: whitespace, quotes, brackets.
const URL_TAIL = String.raw`[^\s"'<>()\[\]{}]+`;

// No-break space, en dash, em dash, built from their code points (ESLint bans the raw characters).
const NBSP_DASHES = String.fromCodePoint(0xa0, 0x2013, 0x2014);

const PATTERNS: readonly (readonly [MaskKind, RegExp])[] = [
  // Order matters, as on the server: links and emails first, so their digits never read as a phone.
  [
    'url',
    new RegExp(
      String.raw`${START}[a-z][a-z0-9+.-]*://${URL_TAIL}|${START}www\.${URL_TAIL}|${START}(?:[${WORD}-]+\.)+[a-z]{2,}/(?:${URL_TAIL})?`,
      'giu',
    ),
  ],
  ['email', new RegExp(String.raw`[${WORD}.+'-]+@[${WORD}-]+(?:\.[${WORD}-]+)+`, 'gu')],
  // An optional +, then at least 9 digits, each gap up to three separators (spaces, no-break
  // spaces, dots, dashes incl. en and em, slashes, brackets). Years and ranges stay unmasked.
  [
    'phone',
    new RegExp(String.raw`\+?\(?${DIGIT}(?:[\s().\-/${NBSP_DASHES}]{0,3}${DIGIT}){8,}`, 'gu'),
  ],
];

/** The placeholder the server writes instead of a match. */
export function placeholder(kind: MaskKind): string {
  return `[${kind}]`;
}

/** The text split into kept pieces and masked ones, in order (for rendering without HTML). */
export function maskParts(text: string): MaskPart[] {
  let parts: MaskPart[] = [{ kind: 'text', text }];
  for (const [kind, pattern] of PATTERNS) {
    parts = parts.flatMap((part) =>
      part.kind === 'text' ? split(part.text, kind, pattern) : part,
    );
  }
  return parts.filter((part) => part.text !== '');
}

/** The masked text as the server stores it. */
export function maskText(text: string): string {
  return maskParts(text)
    .map((part) => (part.kind === 'text' ? part.text : placeholder(part.kind)))
    .join('');
}

function split(text: string, kind: MaskKind, pattern: RegExp): MaskPart[] {
  const parts: MaskPart[] = [];
  let from = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push({ kind: 'text', text: text.slice(from, match.index) });
    parts.push({ kind, text: match[0] });
    from = match.index + match[0].length;
  }
  parts.push({ kind: 'text', text: text.slice(from) });
  return parts;
}
