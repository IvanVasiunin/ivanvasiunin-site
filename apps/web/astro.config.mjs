// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // Static output (ADR-0002). The production domain is set in Phase 8.
  output: 'static',
  integrations: [react()],
});
