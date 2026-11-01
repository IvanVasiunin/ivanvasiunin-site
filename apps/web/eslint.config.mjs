// @ts-check
// ESLint flat config for apps/web. Each project rule is tagged with the rules file it enforces
// (.claude/rules/*.md), so a rule can be traced back to its reason.
import js from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import astro from 'eslint-plugin-astro';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import vitest from '@vitest/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TS_FILES = ['**/*.{ts,tsx,mts}'];

// `no-restricted-syntax` entries. A later config object replaces the whole rule, so the React
// block repeats the default-export entries.
const DEFAULT_EXPORT_MESSAGE =
  'Use named exports. Default exports are allowed only in framework config files.';
const NO_DEFAULT_EXPORTS = [
  { selector: 'ExportDefaultDeclaration', message: DEFAULT_EXPORT_MESSAGE },
  { selector: "ExportSpecifier[exported.name='default']", message: DEFAULT_EXPORT_MESSAGE },
];
const REACT_RESTRICTIONS = [
  {
    selector:
      'ClassDeclaration[superClass.name=/^(Component|PureComponent)$/], ClassDeclaration[superClass.property.name=/^(Component|PureComponent)$/]',
    message:
      'Use function components. The only class allowed is ErrorBoundary (with a disable comment).',
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'No raw HTML. Render model output with react-markdown + rehype-sanitize.',
  },
  {
    selector:
      "JSXAttribute[name.name='style'] Property > :matches(Identifier, Literal[value=/^(?!--)/]).key",
    message: 'No inline styles. Only CSS custom properties are allowed: style={{ "--x": value }}.',
  },
];

export default defineConfig(
  globalIgnores(['dist/', '.astro/', 'node_modules/', 'src/lib/api/schema.d.ts']),

  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: { globals: { ...globals.browser } },
  },

  js.configs.recommended,
  comments.recommended,

  // TypeScript with type information (typescript.md).
  {
    files: TS_FILES,
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
      ],
    },
  },

  // React islands: hooks rules and JSX accessibility (react.md, html-a11y.md).
  {
    files: ['**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.configs.strict],
  },

  // Astro components: syntax rules and accessibility (html-a11y.md).
  astro.configs['flat/recommended'],
  astro.configs['flat/jsx-a11y-strict'],

  // Rules for all source files.
  {
    rules: {
      // Disable comments must explain themselves (typescript.md).
      '@eslint-community/eslint-comments/require-description': 'error',
      // Named exports only (typescript.md).
      'no-restricted-syntax': ['error', ...NO_DEFAULT_EXPORTS],
      // No JS animation libraries: CSS transitions only (css-scss.md).
      'no-restricted-imports': [
        'error',
        {
          paths: ['gsap', 'motion', 'framer-motion', 'animejs', 'lottie-web', 'lottie-react'].map(
            (name) => ({ name, message: 'JS animation libraries are forbidden; use CSS.' }),
          ),
          patterns: [
            {
              group: ['gsap/*', 'motion/*', 'framer-motion/*', 'animejs/*', '@lottiefiles/*'],
              message: 'JS animation libraries are forbidden; use CSS.',
            },
          ],
        },
      ],
    },
  },

  // React: function components, no raw HTML, no inline styles (react.md).
  {
    files: ['**/*.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...NO_DEFAULT_EXPORTS, ...REACT_RESTRICTIONS] },
  },

  // Unit and component tests: no focused or disabled tests (testing.md).
  {
    files: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    extends: [vitest.configs.recommended],
    rules: {
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
    },
  },

  // Config files, build scripts and E2E tests run in Node. Config files must default-export their config.
  {
    files: [
      '*.config.{js,mjs,ts,mts}',
      'e2e/**/*.ts',
      'scripts/**/*.{mjs,ts}',
      'lighthouse/**/*.cjs',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['*.config.{js,mjs,ts,mts}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
