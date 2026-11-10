// Light / dark theme (SPEC US-X1). Until the visitor picks a theme, the page is dark (Ivan,
// 2026-11-10: the dark sky is the site's face; a phone in light mode opened it light); the toggle
// then switches between light and dark and remembers the choice.
//
// `readStoredTheme` and `applyTheme` are also serialized with `Function.prototype.toString()` into
// the inline head script in BaseLayout, which runs before first paint (no flash). They must stay
// self-contained: no references to imports, module constants or other functions; everything they need
// comes in as arguments. theme.test.ts runs their serialized source to enforce this.

export const THEME_STORAGE_KEY = 'theme';

export type Theme = 'light' | 'dark';

/** Must match `--color-bg` in src/styles/tokens.scss: mobile browsers paint their UI in this colour. */
export const THEME_COLOR: Readonly<Record<Theme, string>> = { light: '#f4efe5', dark: '#0e1430' };

/** A stored value (untrusted) as a theme: anything other than `light` / `dark` means no choice yet. */
export function parseTheme(value: string | null): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/**
 * The stored choice, or `null` when there is none. Storage is untrusted: an unknown value, or storage
 * that throws (blocked cookies, private mode), means no choice.
 */
export function readStoredTheme(
  getStorage: () => Pick<Storage, 'getItem'>,
  key: string,
): 'light' | 'dark' | null {
  try {
    const value = getStorage().getItem(key);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** The theme before any choice. Keep in step with tokens.scss (dark unless `data-theme="light"`). */
export const DEFAULT_THEME: Theme = 'dark';

/**
 * Sets `data-theme` on the root (none for `null`: the CSS default, dark) and keeps the `theme-color`
 * and `color-scheme` metas in step with the visible theme.
 */
export function applyTheme(
  doc: Document,
  theme: 'light' | 'dark' | null,
  colors: Readonly<Record<'light' | 'dark', string>>,
): void {
  const root = doc.documentElement;
  if (theme === null) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  // No choice: dark (DEFAULT_THEME; a literal, this function is serialized on its own).
  const visible = theme ?? 'dark';
  const themeColor = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = colors[visible];
  }
  const colorScheme = doc.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (colorScheme) {
    colorScheme.content = visible;
  }
}

/** Stores the choice. Storage failures are ignored: the choice then lasts for the page. */
export function storeTheme(
  getStorage: () => Pick<Storage, 'setItem'>,
  key: string,
  theme: Theme,
): void {
  try {
    getStorage().setItem(key, theme);
  } catch {
    // Blocked storage: nothing to persist to.
  }
}

/** The visible theme: the stored choice, else the default. */
export function resolveTheme(stored: Theme | null): Theme {
  return stored ?? DEFAULT_THEME;
}

/** The toggle switches to the other theme. */
export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** Source of the inline head script: applies the stored choice before first paint. */
export function themeHeadScript(): string {
  return `(${applyTheme.toString()})(document,(${readStoredTheme.toString()})(()=>localStorage,${JSON.stringify(THEME_STORAGE_KEY)}),${JSON.stringify(THEME_COLOR)});`;
}
