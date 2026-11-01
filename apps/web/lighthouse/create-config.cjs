// Shared Lighthouse CI config. Budgets: docs/TESTING.md §5 and .claude/rules/mobile-performance.md.
// LHCI serves dist/ with gzip (compression middleware), so `resource-summary` sizes are gzip sizes.
const { chromium } = require('@playwright/test');

const KB = 1024;

/**
 * @param {{ profile: 'mobile' | 'desktop' }} options
 */
function createConfig({ profile }) {
  const isMobile = profile === 'mobile';

  return {
    ci: {
      collect: {
        staticDistDir: './dist',
        // The port is replaced by the port of the static server LHCI starts.
        url: ['http://localhost/', 'http://localhost/cv/'],
        numberOfRuns: 3,
        // The same Chromium build that Playwright uses, so no separate Chrome install is needed.
        chromePath: chromium.executablePath(),
        // Mobile is Lighthouse's default: Moto G Power emulation, simulated Slow 4G, 4x CPU.
        settings: isMobile ? {} : { preset: 'desktop' },
      },
      assert: {
        assertMatrix: [
          {
            matchingUrlPattern: '.*',
            assertions: {
              'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
              'categories:accessibility': ['error', { minScore: 0.95 }],
            },
          },
          {
            // `/` (AI mode): JS loaded during the run, i.e. before the visualization island.
            matchingUrlPattern: '^http://[^/]+/$',
            assertions: {
              'resource-summary:script:size': ['error', { maxNumericValue: 150 * KB }],
            },
          },
          {
            matchingUrlPattern: '/cv/$',
            assertions: {
              'categories:performance': ['error', { minScore: 0.95 }],
              'categories:best-practices': ['error', { minScore: 0.95 }],
              'categories:seo': ['error', { minScore: 0.95 }],
              'largest-contentful-paint': ['error', { maxNumericValue: isMobile ? 2500 : 2000 }],
              // INP cannot be measured in a lab run; Total Blocking Time is its lab proxy.
              'total-blocking-time': ['error', { maxNumericValue: 200 }],
              'resource-summary:script:size': ['error', { maxNumericValue: 30 * KB }],
            },
          },
        ],
      },
      upload: {
        // Reports stay on disk; nothing is uploaded to third-party storage.
        target: 'filesystem',
        outputDir: `./.lighthouseci/${profile}`,
      },
    },
  };
}

module.exports = { createConfig };
