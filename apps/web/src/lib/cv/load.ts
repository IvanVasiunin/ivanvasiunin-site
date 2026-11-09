// Loads the `cv` collection for pages. Per-file frontmatter is validated by Astro's content sync;
// this adds the whole-CV checks (every section present once, unique order), so the build fails
// on an incomplete CV too.
import { getCollection, type CollectionEntry } from 'astro:content';
import { assertCompleteCv } from './schema';

export async function loadCvEntries(): Promise<CollectionEntry<'cv'>[]> {
  const entries = await getCollection('cv');
  assertCompleteCv(entries.map((entry) => entry.data));
  return entries;
}
