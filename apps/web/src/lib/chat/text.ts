// Plain text of an answer's Markdown, for the screen reader announcement (SPEC US-A1): a screen reader
// would read "asterisk asterisk" for `**` and every link URL. A light pass is enough here; the visible
// answer is rendered by react-markdown.

export function markdownToPlainText(markdown: string): string {
  return (
    markdown
      // [text](url) → text; ![alt](url) → alt
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Heading, quote and list markers at the start of a line.
      .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
      // Emphasis and code marks.
      .replace(/(\*\*|__|\*|_|~~|`+)/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim()
  );
}
