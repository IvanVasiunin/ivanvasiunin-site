// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // Static output (ADR-0002). The production domain is set in Phase 8.
  output: 'static',
  integrations: [react()],
  // The dev toolbar is dev-only (never in the build); disabled because it overlaps the page bottom
  // during visual review. Accessibility audits run via axe in e2e instead.
  devToolbar: { enabled: false },
});
