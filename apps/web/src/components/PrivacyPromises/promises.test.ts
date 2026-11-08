import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROMISE_INTERVAL_MS, startPromises } from './promises';

const TEXTS = ['First promise.', 'Second promise.', 'Third promise.'];

/** The card's markup as the Astro component renders it (first promise current, controls hidden). */
function card(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <ul>${TEXTS.map((text, i) => `<li class="privacy-promises__say"${i === 0 ? ' data-current' : ''}>${text}</li>`).join('')}</ul>
    <div data-privacy-promises-controls hidden>
      ${TEXTS.map((_, i) => `<button type="button" class="privacy-promises__dot" aria-label="Promise ${String(i + 1)}" aria-pressed="${String(i === 0)}"></button>`).join('')}
      <button type="button" data-privacy-promises-pause aria-label="Pause the promises" aria-pressed="false"></button>
    </div>`;
  document.body.append(root);
  return root;
}

const currentText = (root: HTMLElement): string | null | undefined =>
  root.querySelector('[data-current]')?.textContent;
const pauseButton = (root: HTMLElement): HTMLButtonElement => {
  const button = root.querySelector<HTMLButtonElement>('[data-privacy-promises-pause]');
  if (!button) throw new Error('no pause button');
  return button;
};
const dot = (root: HTMLElement, index: number): HTMLButtonElement => {
  const button = root.querySelectorAll<HTMLButtonElement>('.privacy-promises__dot')[index];
  if (!button) throw new Error('no dot');
  return button;
};

describe('startPromises', () => {
  let stop: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('shows the controls and turns the promises on its own, wrapping around', () => {
    const root = card();
    stop = startPromises(root, { reducedMotion: false });

    expect(root.querySelector<HTMLElement>('[data-privacy-promises-controls]')?.hidden).toBe(false);
    expect(currentText(root)).toBe('First promise.');
    vi.advanceTimersByTime(PROMISE_INTERVAL_MS);
    expect(currentText(root)).toBe('Second promise.');
    expect(dot(root, 1).getAttribute('aria-pressed')).toBe('true');
    vi.advanceTimersByTime(2 * PROMISE_INTERVAL_MS);
    expect(currentText(root)).toBe('First promise.');
  });

  it('a dot shows its promise', () => {
    const root = card();
    stop = startPromises(root, { reducedMotion: false });

    dot(root, 2).click();

    expect(currentText(root)).toBe('Third promise.');
    expect(dot(root, 0).getAttribute('aria-pressed')).toBe('false');
  });

  it('Pause stops the turning and Play resumes it (WCAG 2.2.2)', () => {
    const root = card();
    stop = startPromises(root, { reducedMotion: false });

    pauseButton(root).click();
    vi.advanceTimersByTime(3 * PROMISE_INTERVAL_MS);
    expect(currentText(root)).toBe('First promise.');
    expect(pauseButton(root).getAttribute('aria-pressed')).toBe('true');
    expect(pauseButton(root).getAttribute('aria-label')).toBe('Play the promises');

    pauseButton(root).click();
    vi.advanceTimersByTime(PROMISE_INTERVAL_MS);
    expect(currentText(root)).toBe('Second promise.');
  });

  it('hovering or focusing the card holds the current promise', () => {
    const root = card();
    stop = startPromises(root, { reducedMotion: false });

    root.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(2 * PROMISE_INTERVAL_MS);
    expect(currentText(root)).toBe('First promise.');

    root.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(PROMISE_INTERVAL_MS);
    expect(currentText(root)).toBe('Second promise.');

    dot(root, 0).focus();
    vi.advanceTimersByTime(2 * PROMISE_INTERVAL_MS);
    expect(currentText(root)).toBe('Second promise.');
  });

  it('with reduced motion it starts paused and never turns on its own', () => {
    const root = card();
    stop = startPromises(root, { reducedMotion: true });

    vi.advanceTimersByTime(5 * PROMISE_INTERVAL_MS);

    expect(currentText(root)).toBe('First promise.');
    expect(pauseButton(root).getAttribute('aria-pressed')).toBe('true');
  });
});
