// The "Topics" line (SPEC US-A12): the concepts an answer names that the passages it read also
// mention. Matching mirrors ingestion (apps/api ingestion/concepts.py → alias_pattern): any alias,
// a whole word, any case; the edges are explicit because `\b` misreads Cyrillic word edges.
import type { MapConcept, MapPoint } from './points';

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Any of these aliases as a whole word, any case (Unicode-aware). */
export function aliasPattern(aliases: readonly string[]): RegExp {
  const body = [...aliases]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${body})(?![\\p{L}\\p{N}_])`, 'iu');
}

/**
 * The labels of the concepts the answer names that a read point also mentions, in the order the
 * answer first names them.
 */
export function topicsOf(
  answer: string,
  readIds: readonly string[],
  points: ReadonlyMap<string, MapPoint>,
  concepts: readonly MapConcept[],
): string[] {
  const mentioned = new Set(readIds.flatMap((id) => points.get(id)?.concepts ?? []));
  const found: { readonly label: string; readonly at: number }[] = [];
  for (const concept of concepts) {
    if (!mentioned.has(concept.id)) continue;
    const match = aliasPattern(concept.aliases).exec(answer);
    if (match) found.push({ label: concept.label, at: match.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.label);
}
