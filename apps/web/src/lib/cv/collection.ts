// The `cv` content collection, shared by src/content.config.ts and the build-failure test fixtures
// (test-fixtures/cv-*), so the fixtures exercise the exact loader and schema the site uses.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { cvEntrySchema } from './schema';

export const cvCollection = defineCollection({
  // `base` is relative to the Astro project root, so each fixture root loads its own entries.
  loader: glob({ pattern: '**/*.md', base: './src/content/cv' }),
  schema: cvEntrySchema,
});
