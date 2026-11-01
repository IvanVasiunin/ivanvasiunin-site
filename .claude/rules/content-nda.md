---
paths:
  - "data/**"
  - "apps/web/src/content/**"
  - "apps/web/src/pages/**"
  - "apps/api/src/site_api/prompts/**"
  - "apps/api/src/site_api/evals/**"
  - "docs/CREDITS.md"
---

# Content, NDA and licenses

Verification tags: `[hook]`, `[test]`, `[review]`.

## Personal data
- **The phone number never appears** in the repository, the CV source, RAG data, prompts, eval fixtures, screenshots or the site. `data/raw/` (the Word CV) is git-ignored and is never an ingestion source. `[test]` (a test scans content and chunk fixtures for phone patterns) `[hook]` (gitleaks custom rule)
- Public contacts are only email, Telegram, GitHub and LinkedIn, as listed in SPEC §3.2. `[review]`
- Do not edit `data/*.md` without Ivan's explicit OK. `[review]`

## NDA
- Employer content includes only:
  - role;
  - product type;
  - stack;
  - Ivan's contribution in general terms.

  `[review]`
- Never include:
  - internal system or project names;
  - code;
  - non-public metrics;
  - client names or data;
  - internal architecture details.

  When in doubt, leave it out. `[review]`
- Employer logos and brand names in visuals only if publicly allowed. Default: no logos. `[review]`

## Study projects
- Study and course projects are always labelled as such ("Study project", `type=study`). `[review]` `[test]` (frontmatter schema requires a `kind` field for projects)

## Language and voice
- Site UI and all RAG source content are in English. `[review]`
- The assistant (Elio) speaks about Ivan in the **third person**. Prompts and templates never make it speak as Ivan. `[review]` `[test]` (eval cases)

## Assets and licenses
- Fonts, icons, images and other assets must have open licenses (OFL, MIT, ISC, Apache-2.0, CC0, CC BY). Fonts are self-hosted, with no third-party font CDNs. `[test]` (e2e asserts no third-party requests) `[review]`
- Every such asset gets a row in `docs/CREDITS.md` in the same change that adds it. `[review]`
