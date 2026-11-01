// @ts-check
// Stylelint config for apps/web. Each rule enforces an item of .claude/rules/css-scss.md.

const TOKEN_ONLY_PROPERTIES = [
  'color',
  'background-color',
  'border-color',
  'fill',
  'stroke',
  'z-index',
  'transition-duration',
  'transition-timing-function',
  'font-size',
  'border-radius',
  'box-shadow',
];

// One kebab-case word group: `card`, `mode-switch`. A block name starts with a letter.
const WORD = '[a-z0-9]+(?:-[a-z0-9]+)*';
const BLOCK = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
// `.block`, `.block__element`, `.block--modifier`, `.block__element--modifier`, `.is-state`, `.has-state`.
const BEM_CLASS = `^(?:(?:is|has)-${WORD}|${BLOCK}(?:__${WORD})?(?:--${WORD})?)$`;

// `transition` / `transition-property` may only animate transform and opacity.
const ONLY_TRANSFORM_OPACITY =
  '/^(?:none|(?:transform|opacity)\\b[^,]*(?:,\\s*(?:transform|opacity)\\b[^,]*)*)$/';

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard-scss'],
  plugins: [
    'stylelint-selector-bem-pattern',
    'stylelint-declaration-strict-value',
    'stylelint-use-logical',
  ],
  ignoreFiles: ['dist/**', '.astro/**', 'coverage/**', 'node_modules/**'],
  rules: {
    // Architecture: `@use` / `@forward` only.
    'at-rule-disallowed-list': ['import'],

    // Naming: BEM, lowercase kebab-case, no tag-qualified classes.
    'selector-class-pattern': [
      BEM_CLASS,
      {
        message: (/** @type {string} */ selector) =>
          `Expected BEM class name (block__element--modifier): "${selector}"`,
      },
    ],
    'selector-no-qualifying-type': true,

    // Specificity.
    'selector-max-id': 0,
    'max-nesting-depth': [
      3,
      { ignoreAtRules: ['media', 'supports', 'container', 'include', 'layer'] },
    ],
    'selector-max-compound-selectors': 3,
    'declaration-no-important': true,

    // Layout: no float, logical properties, no `vh` (use svh / dvh / lvh).
    'property-disallowed-list': ['float'],
    'csstools/use-logical': 'always',
    'unit-disallowed-list': ['vh'],

    // Tokens: these properties take `var(--…)` or a safe keyword.
    'scale-unlimited/declaration-strict-value': [
      TOKEN_ONLY_PROPERTIES,
      {
        ignoreFunctions: false,
        ignoreValues: [
          'inherit',
          'initial',
          'unset',
          'currentColor',
          'currentcolor',
          'transparent',
          '0',
          'none',
          'auto',
        ],
      },
    ],

    // Units: `rem` font sizes, unitless line heights.
    'declaration-property-unit-allowed-list': {
      'font-size': ['rem', 'vw', '%'],
      'line-height': [],
    },

    // Motion: no `transition: all`, animate only transform and opacity.
    'declaration-property-value-disallowed-list': {
      transition: ['/\\ball\\b/'],
      'transition-property': ['/\\ball\\b/'],
    },
    'declaration-property-value-allowed-list': {
      transition: [ONLY_TRANSFORM_OPACITY],
      'transition-property': [ONLY_TRANSFORM_OPACITY],
    },
  },
  overrides: [
    // Styles inside `.astro` components are linted too.
    { files: ['**/*.astro'], customSyntax: 'postcss-html' },
    // Component styles: one BEM block per file, named after the file; no `*` selectors.
    {
      files: ['src/components/**/*.scss', 'src/islands/**/*.scss'],
      rules: {
        'plugin/selector-bem-pattern': {
          preset: 'bem',
          implicitComponents: ['src/components/**/*.scss', 'src/islands/**/*.scss'],
        },
        'selector-max-universal': 0,
      },
    },
  ],
};
