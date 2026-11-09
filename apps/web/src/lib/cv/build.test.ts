// @vitest-environment node
// ROADMAP 2.1 DoD: the build fails on invalid CV frontmatter. Runs the real Astro content sync
// (the same step `astro build` starts with) against two fixture roots that use the site's cv
// collection: a valid entry must sync, an invalid one must fail with a schema error.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';

const run = promisify(execFile);
const webRootUrl = new URL('../../../', import.meta.url);
const webRoot = fileURLToPath(webRootUrl);
const astroBin = fileURLToPath(new URL('node_modules/astro/bin/astro.mjs', webRootUrl));

async function sync(fixture: string): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [astroBin, 'sync', '--root', `test-fixtures/${fixture}`],
      { cwd: webRoot, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } },
    );
    return { code: 0, output: stdout + stderr };
  } catch (error: unknown) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
  }
}

describe('cv collection in the Astro build', () => {
  test('a valid entry syncs', async () => {
    const result = await sync('cv-valid');

    // The output is part of the comparison so a failure shows Astro's error.
    expect({ code: result.code, output: result.output }).toMatchObject({ code: 0 });
  }, 60_000);

  test('an invalid entry fails the sync with a schema error', async () => {
    const result = await sync('cv-invalid');

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('InvalidContentEntryDataError');
    // Our own schema message (stable), and the offending key whatever Zod's wording around it.
    expect(result.output).toContain('Expected a month as YYYY-MM');
    expect(result.output).toContain('"phone"');
  }, 60_000);
});
