// Frontmatter schema of the `cv` content collection (SPEC §3.2 US-T2, §11 "CV, structured source").
// One Markdown file per CV entry; `section` tells which part of the CV it belongs to.
// The frontmatter holds the Brief view; the Markdown body (where used) is the Full view.
// Objects are strict: an unknown key (for example `phone`) fails the build.
import { z } from 'astro/zod';

/** `YYYY-MM`, e.g. `2024-11`. Month precision is all a CV needs. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month as YYYY-MM');

/** `YYYY` or `YYYY-MM`, for dates known only to the year (some course certificates). */
const yearOrMonthSchema = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Expected a date as YYYY or YYYY-MM');

const yearSchema = z.number().int().min(1990).max(2100);

const textSchema = z.string().trim().min(1);

/** Brief view: 1–4 short bullets that can be skimmed in seconds. */
const briefSchema = z.array(textSchema.max(200)).min(1).max(4);

const stackSchema = z.array(textSchema).min(1);

/** Sort key inside a section; lower comes first. */
const orderSchema = z.number().int().nonnegative();

const httpsUrlSchema = z.url({ protocol: /^https$/ });

const periodShape = {
  start: monthSchema,
  end: z.union([monthSchema, z.literal('present')]),
};

/** `YYYY-MM` strings compare correctly as plain strings. */
function endsAfterStart(entry: { readonly start: string; readonly end: string }): boolean {
  return entry.end === 'present' || entry.end >= entry.start;
}

const periodError = { message: 'end must not be before start', path: ['end'] };

const profileSchema = z.strictObject({
  section: z.literal('profile'),
  name: textSchema,
  headline: textSchema,
  location: textSchema,
  /** Brief summary; the body is the full summary. */
  brief: briefSchema,
  /** Public contacts only (content-nda rule): no phone, no address. */
  contacts: z.strictObject({
    email: z.email(),
    telegram: z.string().regex(/^@[A-Za-z0-9_]{5,32}$/, 'Expected a Telegram handle like @name'),
    github: httpsUrlSchema.refine((url) => new URL(url).hostname === 'github.com', {
      message: 'Expected a github.com URL',
    }),
    linkedin: httpsUrlSchema.refine(
      (url) => {
        const host = new URL(url).hostname;
        return host === 'linkedin.com' || host.endsWith('.linkedin.com');
      },
      { message: 'Expected a linkedin.com URL' },
    ),
  }),
});

const jobSchema = z
  .strictObject({
    section: z.literal('job'),
    company: textSchema,
    title: textSchema,
    employment: z.enum(['full-time', 'part-time']),
    ...periodShape,
    /** Optional: not every past job has a location worth showing. */
    location: textSchema.optional(),
    /** Optional: non-development roles have no stack. */
    stack: stackSchema.optional(),
    brief: briefSchema,
    order: orderSchema,
  })
  .refine(endsAfterStart, periodError);

const projectSchema = z.strictObject({
  section: z.literal('project'),
  name: textSchema,
  /** Study projects are always labelled as such (content-nda rule). */
  kind: z.enum(['production', 'personal', 'study', 'test-task']),
  date: monthSchema.optional(),
  stack: stackSchema,
  brief: briefSchema,
  repo: httpsUrlSchema.optional(),
  demo: httpsUrlSchema.optional(),
  order: orderSchema,
});

const skillsSchema = z.strictObject({
  section: z.literal('skills'),
  groups: z
    .array(
      z.strictObject({
        name: textSchema,
        items: z.array(textSchema).min(1),
      }),
    )
    .min(1),
});

const educationSchema = z.strictObject({
  section: z.literal('education'),
  entries: z
    .array(
      z
        .strictObject({
          institution: textSchema,
          degree: textSchema,
          /** Optional: a course program has no field of study. */
          field: textSchema.optional(),
          start: yearSchema,
          end: yearSchema,
        })
        .refine((entry) => entry.end >= entry.start, periodError),
    )
    .min(1),
});

const certificationsSchema = z.strictObject({
  section: z.literal('certifications'),
  entries: z
    .array(
      z.strictObject({
        name: textSchema,
        issuer: textSchema,
        date: yearOrMonthSchema,
        url: httpsUrlSchema.optional(),
      }),
    )
    .min(1),
});

const languagesSchema = z.strictObject({
  section: z.literal('languages'),
  entries: z
    .array(
      z.strictObject({
        name: textSchema,
        level: z.enum(['native', 'fluent', 'professional working', 'limited working']),
      }),
    )
    .min(1),
});

export const cvEntrySchema = z.discriminatedUnion('section', [
  profileSchema,
  jobSchema,
  projectSchema,
  skillsSchema,
  educationSchema,
  certificationsSchema,
  languagesSchema,
]);

export type CvEntry = z.infer<typeof cvEntrySchema>;
export type CvSection = CvEntry['section'];

/** Sections that must appear exactly once in the CV. */
export const SINGLETON_SECTIONS = [
  'profile',
  'skills',
  'education',
  'certifications',
  'languages',
] as const satisfies readonly CvSection[];

/** Sections with many entries, ordered by `order`. */
export const LIST_SECTIONS = ['job', 'project'] as const satisfies readonly CvSection[];

/**
 * Checks the collection as a whole, which a per-file schema cannot: every singleton section
 * appears exactly once, at least one job exists, and `order` is unique inside each list section.
 * Returns the problems found (empty when the CV is complete).
 */
export function collectionProblems(entries: readonly CvEntry[]): string[] {
  const problems: string[] = [];

  for (const section of SINGLETON_SECTIONS) {
    const count = entries.filter((entry) => entry.section === section).length;
    if (count !== 1)
      problems.push(`section "${section}" must appear exactly once, found ${String(count)}`);
  }

  if (!entries.some((entry) => entry.section === 'job')) {
    problems.push('the CV needs at least one "job" entry');
  }

  for (const section of LIST_SECTIONS) {
    const seen = new Set<number>();
    for (const entry of entries) {
      if (entry.section !== section) continue;
      if (seen.has(entry.order)) {
        problems.push(`section "${section}" has a duplicate order ${String(entry.order)}`);
      }
      seen.add(entry.order);
    }
  }

  return problems;
}

/** Throws (and so fails the build) when the CV as a whole is incomplete; see `collectionProblems`. */
export function assertCompleteCv(entries: readonly CvEntry[]): void {
  const problems = collectionProblems(entries);
  if (problems.length > 0) {
    throw new Error(`Invalid CV content (src/content/cv):\n- ${problems.join('\n- ')}`);
  }
}
