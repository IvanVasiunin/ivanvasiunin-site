// Brief / Full view of the CV (SPEC §3.2 US-T1, ROADMAP 2.4).
// - The view lives in the URL (`?view=brief`; Full is the default and drops the parameter), so it
//   survives reloads and shared links.
// - A tiny inline head script sets `data-cv-view` on <html> before first paint (no flash of the Full
//   view); CSS (styles/utilities.scss) shows the blocks marked `data-cv-only` for that view.
// - Without JS there is no attribute: CSS shows the Full view, and the switch stays `hidden`.
//
// `readCvView` and `applyCvView` are serialized with `Function.prototype.toString()` into the head
// script, so they must stay self-contained: no imports, module constants or other functions.
// The unit test runs the serialized text, and the e2e tests run the built page; a bundler option that
// rewrites function bodies (esbuild `keepNames`, coverage instrumentation) would break it.

export type CvView = 'brief' | 'full';

/** The URL parameter; `readCvView` repeats the literal because it must stay self-contained. */
export const CV_VIEW_PARAM = 'view';

/** `?view=brief` → Brief; anything else (or nothing) → Full. */
export function readCvView(search: string): CvView {
  return new URLSearchParams(search).get('view') === 'brief' ? 'brief' : 'full';
}

export function applyCvView(root: HTMLElement, view: CvView): void {
  root.dataset.cvView = view;
}

export function parseCvView(value: string | undefined): CvView | null {
  return value === 'brief' || value === 'full' ? value : null;
}

/** The same page with the view in its query: `?view=brief`, or no parameter for Full. */
export function cvViewUrl(href: string, view: CvView): string {
  const url = new URL(href);
  if (view === 'brief') url.searchParams.set(CV_VIEW_PARAM, view);
  else url.searchParams.delete(CV_VIEW_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Inline <head> script for /cv; its hash goes into the page's CSP (see cv.astro). */
export function cvViewHeadScript(): string {
  return `(${applyCvView.toString()})(document.documentElement,(${readCvView.toString()})(location.search));`;
}

type ViewWindow = Pick<Window, 'location' | 'history'>;

/**
 * Wires the Brief / Full buttons (`[data-cv-view-option]` inside `group`): reflects the current view
 * in `aria-pressed` and in the group's `data-view` (the sliding pill), switches the view on click and
 * records it in the URL without a new history entry. After the first click, `data-cv-view-animate` on
 * the root lets the newly shown content fade in (styles/utilities.scss); the first paint never animates.
 * Reveals the group, which is `hidden` in the HTML for visitors without JS.
 */
export function initCvViewSwitch(group: HTMLElement, root: HTMLElement, win: ViewWindow): void {
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('[data-cv-view-option]')];

  const render = (view: CvView): void => {
    applyCvView(root, view);
    group.dataset.view = view;
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.cvViewOption === view));
    }
  };

  render(readCvView(win.location.search));
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const view = parseCvView(button.dataset.cvViewOption);
      if (!view) return;
      root.dataset.cvViewAnimate = '';
      render(view);
      win.history.replaceState(win.history.state, '', cvViewUrl(win.location.href, view));
    });
  }
  group.hidden = false;
}
