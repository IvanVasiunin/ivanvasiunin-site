import { describe, expect, test } from 'vitest';
import { assertCompleteCv, collectionProblems, cvEntrySchema, type CvEntry } from './schema';

const job = {
  section: 'job',
  company: 'Acme',
  title: 'Frontend Developer',
  employment: 'full-time',
  start: '2020-01',
  end: 'present',
  location: 'Remote',
  stack: ['HTML', 'SCSS'],
  brief: ['Built reusable UI components.'],
  order: 1,
} as const;

const profile = {
  section: 'profile',
  name: 'Ivan Vasiunin',
  headline: 'Frontend Developer',
  location: 'Remote',
  brief: ['Ten years of frontend.'],
  contacts: {
    email: 'ivanvasyunin@gmail.com',
    telegram: '@IvanVasiunin',
    github: 'https://github.com/IvanVasiunin',
    linkedin: 'https://www.linkedin.com/in/ivan-vasiunin-9967a5132/',
  },
} as const;

const project = {
  section: 'project',
  name: 'Portfolio page',
  kind: 'study',
  date: '2023-05',
  stack: ['React'],
  brief: ['A course capstone.'],
  repo: 'https://github.com/IvanVasiunin/portfolio-page-ReactJS',
  order: 1,
} as const;

const skills = {
  section: 'skills',
  groups: [{ name: 'Frontend', items: ['HTML', 'CSS'] }],
} as const;

const education = {
  section: 'education',
  entries: [
    {
      institution: 'Donetsk National Technical University',
      degree: 'Bachelor',
      field: 'Telecommunications',
      start: 2010,
      end: 2014,
    },
  ],
} as const;

const certifications = {
  section: 'certifications',
  entries: [{ name: 'AI Engineer', issuer: 'Course', date: '2026-06' }],
} as const;

const languages = {
  section: 'languages',
  entries: [{ name: 'English', level: 'professional working' }],
} as const;

function issues(data: unknown): string[] {
  const result = cvEntrySchema.safeParse(data);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

function omit(entry: object, ...keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !keys.includes(key)));
}

describe('cvEntrySchema', () => {
  test.each([profile, job, project, skills, education, certifications, languages])(
    'accepts a valid "$section" entry',
    (entry) => {
      expect(issues(entry)).toEqual([]);
    },
  );

  test('rejects an unknown section', () => {
    expect(issues({ ...job, section: 'hobbies' })).not.toEqual([]);
  });

  test('rejects unknown keys, so a phone field cannot slip in', () => {
    expect(issues({ ...job, phone: '000' })).toEqual([': Unrecognized key: "phone"']);
    expect(issues({ ...profile, contacts: { ...profile.contacts, phone: '000' } })).toEqual([
      'contacts: Unrecognized key: "phone"',
    ]);
  });

  test.each(['2020', '2020-13', '2020-1', 'Jan 2020'])('rejects the month "%s"', (start) => {
    expect(issues({ ...job, start })).toEqual(['start: Expected a month as YYYY-MM']);
  });

  test('rejects a job that ends before it starts, and accepts the same month', () => {
    expect(issues({ ...job, start: '2020-05', end: '2020-04' })).toEqual([
      'end: end must not be before start',
    ]);
    expect(issues({ ...job, start: '2020-05', end: '2020-05' })).toEqual([]);
  });

  test('rejects education that ends before it starts', () => {
    const [entry] = education.entries;
    expect(issues({ ...education, entries: [{ ...entry, end: 2009 }] })).toEqual([
      'entries.0.end: end must not be before start',
    ]);
  });

  test('requires the Brief bullets: 1 to 4, each at most 200 characters', () => {
    expect(issues({ ...job, brief: [] })).not.toEqual([]);
    expect(issues({ ...job, brief: ['a', 'b', 'c', 'd', 'e'] })).not.toEqual([]);
    expect(issues({ ...job, brief: ['x'.repeat(201)] })).not.toEqual([]);
    expect(issues({ ...job, brief: ['   '] })).not.toEqual([]);
  });

  test('requires a project kind, so study projects are always labelled', () => {
    expect(issues({ ...project, kind: undefined })).not.toEqual([]);
    expect(issues({ ...project, kind: 'hobby' })).not.toEqual([]);
  });

  test('optional fields may be left out where the source has no data', () => {
    const [degree] = education.entries;

    expect(issues(omit(job, 'location', 'stack'))).toEqual([]);
    expect(issues(omit(project, 'date'))).toEqual([]);
    expect(issues({ ...education, entries: [omit(degree, 'field')] })).toEqual([]);
  });

  test.each([
    ['2026', true],
    ['2026-10', true],
    ['26', false],
    ['2026-00', false],
  ])('a certification date "%s" is valid: %s', (date, valid) => {
    const [certificate] = certifications.entries;
    const result = issues({ ...certifications, entries: [{ ...certificate, date }] });
    expect(result.length === 0).toBe(valid);
  });

  test('accepts only https links', () => {
    expect(issues({ ...project, repo: 'http://github.com/IvanVasiunin/x' })).not.toEqual([]);
  });

  test.each([
    ['email', 'not-an-email'],
    ['telegram', 'IvanVasiunin'],
    ['github', 'https://gitlab.com/IvanVasiunin'],
    ['linkedin', 'https://example.com/in/ivan'],
    ['linkedin', 'https://evillinkedin.com/in/ivan'],
  ])('rejects an invalid %s contact', (key, value) => {
    const result = issues({ ...profile, contacts: { ...profile.contacts, [key]: value } });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(new RegExp(`^contacts\\.${key}: `));
  });
});

describe('collectionProblems', () => {
  const complete: CvEntry[] = [
    profile,
    job,
    { ...job, company: 'Beta', order: 2 },
    project,
    skills,
    education,
    certifications,
    languages,
  ].map((entry) => cvEntrySchema.parse(entry));

  test('a complete CV has no problems', () => {
    expect(collectionProblems(complete)).toEqual([]);
  });

  test('reports a missing and a duplicated singleton section', () => {
    const entries: CvEntry[] = [
      ...complete.filter((entry) => entry.section !== 'languages'),
      cvEntrySchema.parse(skills),
    ];

    expect(collectionProblems(entries)).toEqual([
      'section "skills" must appear exactly once, found 2',
      'section "languages" must appear exactly once, found 0',
    ]);
  });

  test('requires at least one job', () => {
    const entries = complete.filter((entry) => entry.section !== 'job');

    expect(collectionProblems(entries)).toEqual(['the CV needs at least one "job" entry']);
  });

  test('reports a duplicate order inside a list section', () => {
    const entries = [...complete, cvEntrySchema.parse({ ...job, company: 'Gamma', order: 2 })];

    expect(collectionProblems(entries)).toEqual(['section "job" has a duplicate order 2']);
  });
});

describe('assertCompleteCv', () => {
  test('passes a complete CV and throws with every problem listed otherwise', () => {
    const complete = [profile, job, skills, education, certifications, languages].map((entry) =>
      cvEntrySchema.parse(entry),
    );

    expect(() => {
      assertCompleteCv(complete);
    }).not.toThrow();
    expect(() => {
      assertCompleteCv(complete.filter((entry) => entry.section !== 'profile'));
    }).toThrow(/Invalid CV content[\s\S]*section "profile" must appear exactly once, found 0/);
  });
});
