import { describe, expect, test } from 'vitest';
import { cvEntrySchema, type CvEntry } from './schema';
import {
  formatDate,
  jsonLdText,
  personJsonLd,
  projectKindLabel,
  sectionEntries,
  singleEntry,
  printableUrl,
  telegramUrl,
  type CvData,
} from './view';

const profile = cvEntrySchema.parse({
  section: 'profile',
  name: 'Ivan Vasiunin',
  headline: 'Frontend Developer',
  location: 'Valencia, Spain',
  brief: ['Frontend.'],
  contacts: {
    email: 'ivanvasyunin@gmail.com',
    telegram: '@IvanVasiunin',
    github: 'https://github.com/IvanVasiunin',
    linkedin: 'https://www.linkedin.com/in/ivan-vasiunin-9967a5132/',
  },
}) as CvData<'profile'>;

function job(company: string, order: number, end = '2020-01'): CvData<'job'> {
  return cvEntrySchema.parse({
    section: 'job',
    company,
    title: 'Developer',
    employment: 'full-time',
    start: '2019-01',
    end,
    brief: ['Work.'],
    order,
  }) as CvData<'job'>;
}

const education = cvEntrySchema.parse({
  section: 'education',
  entries: [
    { institution: 'DonNTU', degree: 'Specialist', start: 2014, end: 2015 },
    { institution: 'DonNTU', degree: 'Bachelor', start: 2010, end: 2014 },
    { institution: 'IT STEP', degree: 'Program', start: 2018, end: 2019 },
  ],
}) as CvData<'education'>;

const languages = cvEntrySchema.parse({
  section: 'languages',
  entries: [
    { name: 'English', level: 'professional working' },
    { name: 'Spanish', level: 'limited working' },
  ],
}) as CvData<'languages'>;

const entry = (id: string, data: CvEntry) => ({ id, data, extra: id.toUpperCase() });

describe('sectionEntries / singleEntry', () => {
  const entries = [
    entry('b', job('Beta', 2)),
    entry('profile', profile),
    entry('a', job('Acme', 1)),
  ];

  test('returns one section sorted by order, keeping the extra fields of the entries', () => {
    const jobs = sectionEntries(entries, 'job');

    expect(jobs.map((item) => item.data.company)).toEqual(['Acme', 'Beta']);
    expect(jobs[0]?.extra).toBe('A');
  });

  test('singleEntry returns the singleton and throws when it is missing', () => {
    expect(singleEntry(entries, 'profile').data.name).toBe('Ivan Vasiunin');
    expect(() => singleEntry(entries, 'skills')).toThrow('CV section "skills" is missing');
  });
});

describe('formatDate', () => {
  test.each([
    ['2024-11', 'Nov 2024'],
    ['2016-01', 'Jan 2016'],
    ['2026', '2026'],
  ])('%s → %s', (input, label) => {
    expect(formatDate(input)).toBe(label);
  });
});

describe('labels', () => {
  test('study projects are labelled "Study project"', () => {
    expect(projectKindLabel('study')).toBe('Study project');
    expect(projectKindLabel('personal')).toBe('Personal project');
  });

  test('telegramUrl turns a handle into a t.me link', () => {
    expect(telegramUrl('@IvanVasiunin')).toBe('https://t.me/IvanVasiunin');
  });

  test('printableUrl drops the scheme, www. and the trailing slash', () => {
    expect(printableUrl('https://www.linkedin.com/in/ivan-vasiunin-9967a5132/')).toBe(
      'linkedin.com/in/ivan-vasiunin-9967a5132',
    );
    expect(printableUrl('https://github.com/IvanVasiunin/numbers-validator')).toBe(
      'github.com/IvanVasiunin/numbers-validator',
    );
    expect(printableUrl('https://example.com/')).toBe('example.com');
    expect(printableUrl('https://example.com/a?b=1')).toBe('example.com/a?b=1');
  });
});

describe('personJsonLd', () => {
  const person = personJsonLd({
    profile,
    jobs: [job('BrainRocket', 1, 'present'), job('Liketelecom', 2)],
    education,
    languages,
    url: 'https://ivanvasiunin.com/cv',
  });

  test('describes the person with public contacts only', () => {
    expect(person).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Ivan Vasiunin',
      jobTitle: 'Frontend Developer',
      url: 'https://ivanvasiunin.com/cv',
      email: 'mailto:ivanvasyunin@gmail.com',
      sameAs: [
        'https://github.com/IvanVasiunin',
        'https://www.linkedin.com/in/ivan-vasiunin-9967a5132/',
        'https://t.me/IvanVasiunin',
      ],
      knowsLanguage: ['English', 'Spanish'],
    });
    expect(JSON.stringify(person)).not.toMatch(/telephone|streetAddress/);
  });

  test('lists only current employers and each school once', () => {
    expect(person.worksFor).toEqual([{ '@type': 'Organization', name: 'BrainRocket' }]);
    expect(person.alumniOf.map((school) => school.name)).toEqual(['DonNTU', 'IT STEP']);
  });
});

describe('jsonLdText', () => {
  test('escapes "<" so the data can never close its script element', () => {
    const text = jsonLdText({ name: '</script><script>alert(1)</script>' });

    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});
