import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  CV_VIEW_PARAM,
  cvViewHeadScript,
  cvViewUrl,
  initCvViewSwitch,
  parseCvView,
  readCvView,
} from './view-mode';

describe('readCvView', () => {
  test.each([
    ['?view=brief', 'brief'],
    ['?view=full', 'full'],
    ['', 'full'],
    ['?view=BRIEF', 'full'],
    ['?view=other', 'full'],
    ['?lang=en&view=brief', 'brief'],
  ])('%s → %s', (search, view) => {
    expect(readCvView(search)).toBe(view);
  });

  test('reads the same parameter name the URL builder writes', () => {
    expect(readCvView(`?${CV_VIEW_PARAM}=brief`)).toBe('brief');
  });
});

describe('parseCvView', () => {
  test('accepts only the two views', () => {
    expect(parseCvView('brief')).toBe('brief');
    expect(parseCvView('full')).toBe('full');
    expect(parseCvView('other')).toBeNull();
    expect(parseCvView(undefined)).toBeNull();
  });
});

describe('cvViewUrl', () => {
  test('adds ?view=brief and drops the parameter for the default Full view', () => {
    expect(cvViewUrl('https://ivanvasiunin.com/cv', 'brief')).toBe('/cv?view=brief');
    expect(cvViewUrl('https://ivanvasiunin.com/cv?view=brief', 'full')).toBe('/cv');
  });

  test('keeps other parameters and the fragment', () => {
    expect(cvViewUrl('https://ivanvasiunin.com/cv?x=1#skills', 'brief')).toBe(
      '/cv?x=1&view=brief#skills',
    );
  });
});

describe('cvViewHeadScript', () => {
  afterEach(() => {
    delete document.documentElement.dataset.cvView;
    window.history.replaceState(null, '', '/');
  });

  test.each([
    ['/cv?view=brief', 'brief'],
    ['/cv', 'full'],
  ])('on %s sets data-cv-view="%s" on <html>', (path, view) => {
    window.history.replaceState(null, '', path);

    // Runs the exact serialized source the head script ships: it fails if the serialized functions
    // reference anything outside their own arguments (same approach as theme.test.ts).
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- executes the inline head script's own source, built from this module's functions
    const headScript = new Function(cvViewHeadScript()) as () => void;
    headScript();

    expect(document.documentElement.dataset.cvView).toBe(view);
  });
});

describe('initCvViewSwitch', () => {
  let group: HTMLElement;
  const root = document.documentElement;
  const button = (view: string): HTMLButtonElement => {
    const element = group.querySelector<HTMLButtonElement>(`[data-cv-view-option="${view}"]`);
    if (!element) throw new Error(`no ${view} button`);
    return element;
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-cv-view-switch hidden>
        <button type="button" data-cv-view-option="brief" aria-pressed="false">Brief</button>
        <button type="button" data-cv-view-option="full" aria-pressed="true">Full</button>
      </div>`;
    const found = document.querySelector<HTMLElement>('[data-cv-view-switch]');
    if (!found) throw new Error('no group');
    group = found;
  });

  afterEach(() => {
    delete root.dataset.cvView;
    delete root.dataset.cvViewAnimate;
    window.history.replaceState(null, '', '/');
  });

  test('reveals the switch and reflects the view from the URL', () => {
    window.history.replaceState(null, '', '/cv?view=brief');

    initCvViewSwitch(group, root, window);

    expect(group.hidden).toBe(false);
    expect(root.dataset.cvView).toBe('brief');
    expect(group.dataset.view).toBe('brief');
    expect(root.dataset.cvViewAnimate).toBeUndefined();
    expect(button('brief').getAttribute('aria-pressed')).toBe('true');
    expect(button('full').getAttribute('aria-pressed')).toBe('false');
  });

  test('a click switches the view and records it in the URL without a new history entry', () => {
    window.history.replaceState(null, '', '/cv#skills');
    const historyLength = window.history.length;
    initCvViewSwitch(group, root, window);

    button('brief').click();

    expect(root.dataset.cvView).toBe('brief');
    expect(group.dataset.view).toBe('brief');
    expect(root.dataset.cvViewAnimate).toBe('');
    expect(button('brief').getAttribute('aria-pressed')).toBe('true');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/cv?view=brief#skills',
    );
    expect(window.history.length).toBe(historyLength);

    button('full').click();

    expect(root.dataset.cvView).toBe('full');
    expect(button('full').getAttribute('aria-pressed')).toBe('true');
    expect(window.location.search).toBe('');
  });

  test('the buttons work from the keyboard (native buttons: Enter / Space fire click)', () => {
    window.history.replaceState(null, '', '/cv');
    initCvViewSwitch(group, root, window);

    expect(button('brief').tagName).toBe('BUTTON');
    expect(button('brief').type).toBe('button');
  });
});
