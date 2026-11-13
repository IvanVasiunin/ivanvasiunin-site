// Pure helpers that turn validated `cv` entries into what the /cv page renders (ROADMAP 2.3):
// section lookup, ordering, date labels and the JSON-LD `Person` (SPEC §3.2 US-T2).
import type { CvEntry, CvSection } from './schema';

/** The part of an Astro collection entry these helpers need; real entries carry more. */
export interface CvEntryLike {
  readonly id: string;
  readonly data: CvEntry;
}

export type CvData<S extends CvSection> = Extract<CvEntry, { section: S }>;
export type EntryOf<E extends CvEntryLike, S extends CvSection> = E & { readonly data: CvData<S> };

/** Entries of one section, sorted by `order` where the section has one. */
export function sectionEntries<E extends CvEntryLike, S extends CvSection>(
  entries: readonly E[],
  section: S,
): EntryOf<E, S>[] {
  const matching = entries.filter(
    (entry): entry is EntryOf<E, S> => entry.data.section === section,
  );
  return matching.toSorted((a, b) => orderOf(a.data) - orderOf(b.data));
}

/** The one entry of a singleton section; `assertCompleteCv` guarantees it exists at build time. */
export function singleEntry<E extends CvEntryLike, S extends CvSection>(
  entries: readonly E[],
  section: S,
): EntryOf<E, S> {
  const [entry] = sectionEntries(entries, section);
  if (!entry) throw new Error(`CV section "${section}" is missing`);
  return entry;
}

function orderOf(data: CvEntry): number {
  return 'order' in data ? data.order : 0;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `2024-11` → `Nov 2024`; `2026` → `2026`. Input is schema-validated. */
export function formatDate(date: string): string {
  const [year, month] = date.split('-');
  if (month === undefined) return date;
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year ?? ''}` : date;
}

export const PRESENT_LABEL = 'Present';

const EMPLOYMENT_LABEL = { 'full-time': 'Full-time', 'part-time': 'Part-time' } as const;

export function employmentLabel(employment: CvData<'job'>['employment']): string {
  return EMPLOYMENT_LABEL[employment];
}

const PROJECT_KIND_LABEL = {
  production: 'Production',
  personal: 'Personal project',
  study: 'Study project',
  'test-task': 'Test task',
} as const;

/** Study projects are always labelled "Study project" (content-nda rule). */
export function projectKindLabel(kind: CvData<'project'>['kind']): string {
  return PROJECT_KIND_LABEL[kind];
}

const LANGUAGE_LEVEL_LABEL = {
  native: 'Native',
  fluent: 'Fluent',
  'professional working': 'Professional working',
  'limited working': 'Limited working',
} as const;

export function languageLevelLabel(level: CvData<'languages'>['entries'][number]['level']): string {
  return LANGUAGE_LEVEL_LABEL[level];
}

/** `@IvanVasiunin` → `https://t.me/IvanVasiunin`. */
export function telegramUrl(handle: string): string {
  return `https://t.me/${handle.replace(/^@/, '')}`;
}

/** A URL as people write it on paper: no scheme, no `www.`, no trailing slash (the printed CV). */
export function printableUrl(href: string): string {
  const url = new URL(href);
  const path = `${url.pathname}${url.search}`.replace(/\/$/, '');
  return `${url.hostname.replace(/^www\./, '')}${path}`;
}

interface PersonInput {
  readonly profile: CvData<'profile'>;
  readonly jobs: readonly CvData<'job'>[];
  readonly education: CvData<'education'>;
  readonly languages: CvData<'languages'>;
  /** Absolute URL of the CV page. */
  readonly url: string;
  /** Absolute URL of Ivan's photo, when the page has one. */
  readonly image?: string;
}

/** schema.org `Person` for the CV page. Public data only: no phone, no street address. */
export function personJsonLd({ profile, jobs, education, languages, url, image }: PersonInput) {
  const { contacts } = profile;
  const current = jobs.filter((job) => job.end === 'present');
  const schools = [...new Set(education.entries.map((entry) => entry.institution))];

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    jobTitle: profile.headline,
    url,
    ...(image === undefined ? {} : { image }),
    email: `mailto:${contacts.email}`,
    homeLocation: { '@type': 'Place', name: profile.location },
    sameAs: [contacts.github, contacts.linkedin, telegramUrl(contacts.telegram)],
    worksFor: current.map((job) => ({ '@type': 'Organization', name: job.company })),
    alumniOf: schools.map((name) => ({ '@type': 'EducationalOrganization', name })),
    knowsLanguage: languages.entries.map((entry) => entry.name),
  };
}

/** JSON for an inline `<script type="application/ld+json">`: `<` is escaped so text can never close it. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c');
}
