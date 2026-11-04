// The build-time CV PDF (SPEC §2, §3.2 US-T4; ROADMAP 2.5). Shared by the "Download PDF" link on /cv
// and scripts/build-pdf.mjs, which renders /cv with the print styles into this path after `astro build`.
// Erasable TypeScript only: Node runs the build script and strips the types itself.

/** The page the PDF is printed from. */
export const CV_PAGE_PATH = '/cv/';

/** Where the PDF is served from (and written to, relative to dist/). */
export const CV_PDF_PATH = '/cv/ivan-vasiunin-cv.pdf';
