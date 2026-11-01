import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  THEME_COLOR,
  THEME_STORAGE_KEY,
  applyTheme,
  oppositeTheme,
  parseTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  themeHeadScript,
} from './theme';

const storageWith = (value: string | null): Pick<Storage, 'getItem'> => ({
  getItem: () => value,
});

const throwingStorage = (): never => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

function renderHead(): void {
  document.head.innerHTML = `
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" data-scheme="light" media="(prefers-color-scheme: light)" content="${THEME_COLOR.light}">
    <meta name="theme-color" data-scheme="dark" media="(prefers-color-scheme: dark)" content="${THEME_COLOR.dark}">`;
  document.documentElement.removeAttribute('data-theme');
}

const themeColors = (): string[] =>
  [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
    (meta) => meta.content,
  );
const colorScheme = (): string | undefined =>
  document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.content;

describe('parseTheme', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    [null, null],
    ['', null],
    ['system', null],
    ['DARK', null],
    ['"dark"', null],
  ] as const)('parses %j as %j', (value, expected) => {
    expect(parseTheme(value)).toBe(expected);
  });
});

describe('readStoredTheme', () => {
  it.each(['light', 'dark'] as const)('returns the stored %s choice', (value) => {
    expect(readStoredTheme(() => storageWith(value), THEME_STORAGE_KEY)).toBe(value);
  });

  it.each([null, '', 'system', 'Dark', 'sepia'])('treats %j as no choice', (value) => {
    expect(readStoredTheme(() => storageWith(value), THEME_STORAGE_KEY)).toBeNull();
  });

  it('treats blocked storage as no choice', () => {
    expect(readStoredTheme(throwingStorage, THEME_STORAGE_KEY)).toBeNull();
  });

  it('reads the given key', () => {
    const getItem = vi.fn<(key: string) => string | null>(() => 'dark');
    readStoredTheme(() => ({ getItem }), THEME_STORAGE_KEY);
    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });
});

describe('storeTheme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each(['light', 'dark'] as const)('stores %s', (theme) => {
    storeTheme(() => localStorage, THEME_STORAGE_KEY, theme);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme);
  });

  it('ignores blocked storage', () => {
    expect(() => {
      storeTheme(throwingStorage, THEME_STORAGE_KEY, 'dark');
    }).not.toThrow();
  });
});

describe('resolveTheme', () => {
  it('prefers the stored choice over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system preference when there is no choice', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });
});

describe('oppositeTheme', () => {
  it('switches between light and dark', () => {
    expect(oppositeTheme('light')).toBe('dark');
    expect(oppositeTheme('dark')).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(renderHead);

  it.each(['light', 'dark'] as const)(
    'pins %s: data-theme, both theme-color metas and color-scheme',
    (theme) => {
      applyTheme(document, theme, THEME_COLOR);
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(themeColors()).toEqual([THEME_COLOR[theme], THEME_COLOR[theme]]);
      expect(colorScheme()).toBe(theme);
    },
  );

  it('no choice removes data-theme and restores the per-scheme metas', () => {
    applyTheme(document, 'dark', THEME_COLOR);
    applyTheme(document, null, THEME_COLOR);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(themeColors()).toEqual([THEME_COLOR.light, THEME_COLOR.dark]);
    expect(colorScheme()).toBe('light dark');
  });

  it('works without the metas', () => {
    document.head.innerHTML = '';
    applyTheme(document, 'dark', THEME_COLOR);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('themeHeadScript', () => {
  beforeEach(() => {
    renderHead();
    localStorage.clear();
  });

  // Runs the exact serialized source the head script ships: it fails if the serialized functions
  // reference anything outside their own arguments.
  const runHeadScript = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- executes the inline head script's own source, built from this module's functions
    const headScript = new Function(themeHeadScript()) as () => void;
    headScript();
  };

  it('applies the stored choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runHeadScript();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(themeColors()).toEqual([THEME_COLOR.dark, THEME_COLOR.dark]);
  });

  it('follows the system theme when nothing is stored', () => {
    runHeadScript();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(themeColors()).toEqual([THEME_COLOR.light, THEME_COLOR.dark]);
  });

  it('ignores an invalid stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '<script>');
    runHeadScript();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
