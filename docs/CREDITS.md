# Credits

Every third-party font, icon set, image or other asset used on the site is listed here. Only open licenses are allowed (OFL, MIT, ISC, Apache-2.0, CC0, CC BY), and fonts are self-hosted.

## Fonts

| Font | Version | License | Source | Used for |
|---|---|---|---|---|
| Schibsted Grotesk (variable; the file covers weights 400–900, the site uses 400–700; normal; Latin) | `@fontsource-variable/schibsted-grotesk` 5.3.0 | SIL OFL 1.1, © 2023 The Schibsted-Grotesk Project Authors — [license text](licenses/schibsted-grotesk-OFL.txt) | [Fontsource](https://fontsource.org/fonts/schibsted-grotesk), upstream [schibsted/schibsted-grotesk](https://github.com/schibsted/schibsted-grotesk) | Interface and headings (`--font-sans`) |
| Newsreader (static 400 / 500, normal and italic; Latin and Latin Extended) | `@fontsource/newsreader` 5.3.0 | SIL OFL 1.1, © 2020 The Newsreader Project Authors — [license text](licenses/newsreader-OFL.txt) | [Fontsource](https://fontsource.org/fonts/newsreader), upstream [productiontype/Newsreader](https://github.com/productiontype/Newsreader) | Elio's answers and CV prose (`--font-serif`) |

Font files come from the pinned npm packages above (exact versions in `pnpm-lock.yaml`, ADR-0010) and are served from the site's own origin by the Astro Fonts API (`apps/web/astro.config.mjs`). The OFL texts with the copyright notices are kept in [`docs/licenses/`](licenses/), as the license requires when the fonts are redistributed.

## Icons

| Set | Version | License | Source | Used for |
|---|---|---|---|---|
| — | — | — | — | — |

## Other assets

| Asset | License | Source | Used for |
|---|---|---|---|
| — | — | — | — |

Code dependencies are not listed here; their licenses are recorded in [ADR-0001](adr/0001-tech-stack.md) and in the lock files.
