import { describe, expect, test } from 'vitest';
import { HEADER, renderTypes, staleFiles } from './gen-api.mjs';

const SCHEMA = {
  openapi: '3.1.0',
  info: { title: 'sample', version: 'contract' },
  paths: {},
  components: {
    schemas: {
      Ping: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['ok', 'down'] } },
      },
    },
  },
};

describe('renderTypes', () => {
  test('prints the schema as TypeScript under the generated-file header', async () => {
    const types = await renderTypes(SCHEMA);

    expect(types.startsWith(HEADER)).toBe(true);
    expect(types).toContain('Ping: {');
    expect(types).toMatch(/status: "ok" \| "down";/);
  });
});

describe('staleFiles', () => {
  const generated = new Map([
    ['openapi.json', '{"a": 1}\n'],
    ['schema.d.ts', 'type A = 1;\n'],
  ]);

  test('reports nothing when the committed files match', () => {
    expect(staleFiles(generated, (name) => generated.get(name))).toEqual([]);
  });

  test('ignores CRLF line endings from a Windows checkout', () => {
    expect(staleFiles(generated, (name) => generated.get(name)?.replace(/\n/g, '\r\n'))).toEqual(
      [],
    );
  });

  test('reports a changed or a missing file', () => {
    const committed = new Map([['openapi.json', '{"a": 2}\n']]);
    expect(staleFiles(generated, (name) => committed.get(name))).toEqual([
      'openapi.json',
      'schema.d.ts',
    ]);
  });
});
