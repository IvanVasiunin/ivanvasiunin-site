// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import { fontsourceVariants } from './scripts/fontsource-variants.mjs';

// Subsets. The UI face is Latin only: it is preloaded, and Astro cannot tell subsets apart in local files,
// so a second subset would be preloaded too. The serif also gets Latin Extended for names in CV prose and
// Elio's answers; the browser fetches that file only when text has characters in its unicode-range.
// Neither family has Cyrillic: Russian text falls back to the system fonts (src/styles/README.md).
const UI_SUBSETS = ['latin'];
const PROSE_SUBSETS = ['latin', 'latin-ext'];

// https://astro.build/config
export default defineConfig({
  // Static output (ADR-0002). The production domain is set in Phase 8.
  output: 'static',
  integrations: [react()],
  // The dev toolbar is dev-only (never in the build); disabled because it overlaps the page bottom
  // during visual review. Accessibility audits run via axe in e2e instead.
  devToolbar: { enabled: false },
  // Self-hosted OFL fonts (ROADMAP 1.3, ADR-0010, docs/CREDITS.md). The files come from pinned Fontsource
  // npm packages (versions in the lockfile), so builds are reproducible and need no network; they are
  // served from the site's own origin, so pages make no third-party requests.
  // - Schibsted Grotesk: one variable file (47 KB, latin) for all three weights on the first screen, so a
  //   single preload covers it.
  // - Newsreader: static 400 / 500 files (about 23 KB each; the variable one is 130+ KB with its
  //   optical-size axis), fetched only when text uses them.
  // Astro generates metric-matched fallback faces from the last generic fallback, which keeps the swap
  // shift near zero (CLS).
  fonts: [
    {
      name: 'Schibsted Grotesk',
      cssVariable: '--font-schibsted-grotesk',
      provider: fontProviders.local(),
      fallbacks: ['sans-serif'],
      options: {
        variants: fontsourceVariants(
          '@fontsource-variable/schibsted-grotesk',
          ['wght.css'],
          UI_SUBSETS,
        ),
      },
    },
    {
      name: 'Newsreader',
      cssVariable: '--font-newsreader',
      provider: fontProviders.local(),
      fallbacks: ['serif'],
      options: {
        variants: fontsourceVariants(
          '@fontsource/newsreader',
          ['400.css', '400-italic.css', '500.css', '500-italic.css'],
          PROSE_SUBSETS,
        ),
      },
    },
  ],
});
