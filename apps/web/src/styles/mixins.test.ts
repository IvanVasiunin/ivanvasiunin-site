// @vitest-environment node
// Compiles Sass; needs the file system, not a DOM.
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { describe, expect, it } from 'vitest';

const stylesDir = fileURLToPath(new URL('.', import.meta.url));

const compile = (body: string): string =>
  compileString(`@use 'mixins' as *;\n${body}`, { loadPaths: [stylesDir], style: 'compressed' })
    .css;

describe('gradient-border', () => {
  it('uses the border-box technique from the rules, not mask', () => {
    const css = compile('.panel { @include gradient-border; }');

    expect(css).toContain('border:var(--border-width) solid rgba(0,0,0,0)');
    expect(css).toContain(
      'background-image:linear-gradient(var(--color-surface), var(--color-surface)),var(--gradient-border)',
    );
    expect(css).toContain('background-origin:border-box');
    expect(css).toContain('background-clip:padding-box,border-box');
    expect(css).not.toContain('mask');
  });

  it('accepts a custom fill and border', () => {
    const css = compile(
      '.panel { @include gradient-border(var(--color-bg), var(--gradient-accent)); }',
    );

    expect(css).toContain(
      'linear-gradient(var(--color-bg), var(--color-bg)),var(--gradient-accent)',
    );
  });
});

describe('mq', () => {
  it('emits a min-width range query for a known breakpoint', () => {
    expect(compile('.a { @include mq(md) { color: red; } }')).toContain('@media(width >= 768px)');
  });

  it('fails the build for an unknown breakpoint', () => {
    expect(() => compile('.a { @include mq(huge) { color: red; } }')).toThrow(
      'Unknown breakpoint "huge"',
    );
  });
});
