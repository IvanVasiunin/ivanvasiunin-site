// CSP hashes for inline blocks Astro does not hash itself (`is:inline` scripts and styles).
// Server-side only (used in layout frontmatter at build time).
import { createHash } from 'node:crypto';

/** The CSP source for an inline block: `sha256-<base64 digest of its exact text>`. */
export function cspHash(text: string): `sha256-${string}` {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
}
