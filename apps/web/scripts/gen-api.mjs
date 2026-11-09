// @ts-check
// Generates the frontend's API types from the FastAPI OpenAPI schema (ROADMAP 1.5, typescript.md).
//
//   pnpm run gen:api          regenerate src/lib/api/{openapi.json,schema.d.ts}
//   pnpm run gen:api:check    fail if the committed files differ from a fresh generation (CI)
//
// The schema comes from `site_api.openapi_export` (built from the code, no server needed), so a
// change to a Pydantic model that is not followed by `gen:api` fails the check.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.resolve(WEB_DIR, '../api');
const OUT_DIR = path.join(WEB_DIR, 'src/lib/api');

export const HEADER = `/**
 * GENERATED from the API's OpenAPI schema by \`pnpm --dir apps/web run gen:api\`.
 * Do not edit by hand: change the Pydantic models in apps/api/src/site_api/schemas/ and regenerate.
 * CI fails when this file is stale (\`pnpm --dir apps/web run gen:api:check\`).
 */

`;

/**
 * TypeScript declarations for an OpenAPI document.
 * @param {unknown} schema the parsed OpenAPI JSON (validated by openapi-typescript itself)
 * @returns {Promise<string>}
 */
export async function renderTypes(schema) {
  // openapi-typescript reads the document and returns a TypeScript AST; astToString prints it.
  const ast = await openapiTS(/** @type {import('openapi-typescript').OpenAPI3} */ (schema));
  return HEADER + astToString(ast);
}

/**
 * Names of the files whose committed content differs from the freshly generated content.
 * @param {ReadonlyMap<string, string>} generated file name → expected content
 * @param {(name: string) => string | undefined} readCommitted current content, or undefined if absent
 * @returns {string[]}
 */
export function staleFiles(generated, readCommitted) {
  // Line endings are normalised, so a Windows checkout with CRLF is not reported as stale.
  const normalise = (/** @type {string} */ text) => text.replace(/\r\n/g, '\n');
  return [...generated]
    .filter(([name, content]) => normalise(readCommitted(name) ?? '') !== normalise(content))
    .map(([name]) => name);
}

/** Runs the API's exporter and returns the schema JSON text. */
function exportSchema() {
  const dir = mkdtempSync(path.join(tmpdir(), 'openapi-'));
  const file = path.join(dir, 'openapi.json');
  try {
    const result = spawnSync(
      'uv',
      // --locked: a uv.lock that no longer matches pyproject.toml is an error, not a silent update.
      ['run', '--locked', '--directory', API_DIR, 'python', '-m', 'site_api.openapi_export', file],
      { stdio: 'inherit' },
    );
    if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
      throw new Error(
        'uv is not on PATH: install uv (docs/phase-0-setup.md) to generate API types',
      );
    }
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`openapi_export exited with ${String(result.status)}`);
    return readFileSync(file, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const check = process.argv.includes('--check');
  const json = exportSchema();
  const generated = new Map([
    ['openapi.json', json],
    ['schema.d.ts', await renderTypes(JSON.parse(json))],
  ]);

  const read = (/** @type {string} */ name) => {
    try {
      return readFileSync(path.join(OUT_DIR, name), 'utf8');
    } catch {
      return undefined;
    }
  };

  if (check) {
    const stale = staleFiles(generated, read);
    if (stale.length > 0) {
      console.error(
        `✘ API types are stale: ${stale.join(', ')} in apps/web/src/lib/api/.\n` +
          '  Run `pnpm --dir apps/web run gen:api` and commit the result.',
      );
      process.exit(1);
    }
    console.log('✔ API types match the OpenAPI schema');
    return;
  }

  for (const [name, content] of generated) writeFileSync(path.join(OUT_DIR, name), content);
  console.log(`✔ Wrote ${[...generated.keys()].join(', ')} to apps/web/src/lib/api/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
