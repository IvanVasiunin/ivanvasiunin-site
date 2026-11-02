import { describe, expect, test } from 'vitest';
import path from 'node:path';
import { budgetProblems, isInside, medianSummary, summarize } from './lighthouse.mjs';

const GOOD = {
  performance: 0.99,
  accessibility: 1,
  bestPractices: 1,
  seo: 1,
  lcp: 1200,
  cls: 0,
  tbt: 0,
  scriptBytes: 1024,
};

describe('summarize', () => {
  test('reads scores, metrics and the script transfer size from a Lighthouse result', () => {
    const lhr = {
      categories: {
        performance: { score: 0.97 },
        accessibility: { score: 1 },
        'best-practices': { score: 0.96 },
        seo: { score: 1 },
      },
      audits: {
        'largest-contentful-paint': { numericValue: 1800 },
        'cumulative-layout-shift': { numericValue: 0.02 },
        'total-blocking-time': { numericValue: 30 },
        'resource-summary': {
          details: {
            items: [
              { resourceType: 'script', transferSize: 4096 },
              { resourceType: 'font', transferSize: 47000 },
            ],
          },
        },
      },
    };

    expect(summarize(lhr)).toEqual({
      performance: 0.97,
      accessibility: 1,
      bestPractices: 0.96,
      seo: 1,
      lcp: 1800,
      cls: 0.02,
      tbt: 30,
      scriptBytes: 4096,
    });
  });
});

describe('medianSummary', () => {
  test('takes the median of each number, so one slow run does not decide', () => {
    const runs = [
      { ...GOOD, lcp: 1000, performance: 0.99 },
      { ...GOOD, lcp: 9000, performance: 0.6 },
      { ...GOOD, lcp: 1100, performance: 0.98 },
    ];

    expect(medianSummary(runs)).toMatchObject({ lcp: 1100, performance: 0.98 });
  });
});

describe('budgetProblems', () => {
  test('a fast, accessible page passes', () => {
    expect(budgetProblems('/cv/', 'mobile', GOOD)).toEqual([]);
    expect(budgetProblems('/', 'desktop', GOOD)).toEqual([]);
  });

  test('the CV page has the strict budgets', () => {
    const problems = budgetProblems('/cv/', 'mobile', {
      ...GOOD,
      performance: 0.9,
      lcp: 2600,
      scriptBytes: 31 * 1024,
    });
    expect(problems.join('\n')).toMatch(/performance 0.9 < 0.95/);
    expect(problems.join('\n')).toMatch(/LCP 2600 ms > 2500 ms/);
    expect(problems.join('\n')).toMatch(/script \d+ B > 30 KB/);
  });

  test('desktop LCP has a tighter budget than mobile', () => {
    expect(budgetProblems('/cv/', 'mobile', { ...GOOD, lcp: 2200 })).toEqual([]);
    expect(budgetProblems('/cv/', 'desktop', { ...GOOD, lcp: 2200 })).toHaveLength(1);
  });

  test('the AI page is held to 150 KB of JS before the visualization, and to CLS everywhere', () => {
    const problems = budgetProblems('/', 'mobile', {
      ...GOOD,
      scriptBytes: 151 * 1024,
      cls: 0.2,
      performance: 0.5,
    });
    expect(problems).toHaveLength(2);
  });
});

describe('isInside', () => {
  const dist = path.resolve('dist');

  test('accepts the directory and files under it', () => {
    expect(isInside(dist, dist)).toBe(true);
    expect(isInside(dist, path.join(dist, 'cv', 'index.html'))).toBe(true);
  });

  test('rejects parents and look-alike siblings', () => {
    expect(isInside(dist, path.join(dist, '..', 'package.json'))).toBe(false);
    expect(isInside(dist, path.resolve('dist-evil', 'x'))).toBe(false);
  });
});
