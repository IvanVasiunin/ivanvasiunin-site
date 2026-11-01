/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Unit and component tests (docs/TESTING.md §1). E2E tests live in e2e/ and run with Playwright.
export default getViteConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/lib/api/schema.d.ts'],
    },
  },
});
