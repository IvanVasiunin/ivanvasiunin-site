// The build-time CV PDF (SPEC §2, §3.2 US-T4; ROADMAP 2.5). Shared by the "Download PDF" link on /cv
// and scripts/build-pdf.mjs, which prints the recruiter CV (scripts/cv-resume.html) into this path after
// `astro build`.
// Erasable TypeScript only: Node runs the build script and strips the types itself.

/** Where the PDF is served from (and written to, relative to dist/). */
export const CV_PDF_PATH = '/cv/ivan-vasiunin-cv.pdf';
