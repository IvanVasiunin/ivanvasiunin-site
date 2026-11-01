// Tests for the hook helpers. Run by `node scripts/check-fast.mjs scripts`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { workingTreeKey } from './lib.mjs';

describe('workingTreeKey', () => {
  let repo = '';
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), text);
  };

  before(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'hook-key-'));
    const init = spawnSync('git', ['init', '-q'], { cwd: repo });
    assert.equal(init.status, 0, 'git must be on PATH');
    write('apps/web/a.ts', 'export const a = 1;\n');
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  it('is stable while nothing changes', () => {
    assert.equal(workingTreeKey(repo), workingTreeKey(repo));
  });

  it('changes for files outside apps/ (scripts, hook configs, CI)', () => {
    // Regression: the key used to cover apps/ only, so a cached green run
    // hid broken changes in scripts/ or lefthook.yml from the Stop hook.
    for (const file of ['scripts/x.mjs', 'lefthook.yml', '.github/workflows/ci.yml']) {
      const prev = workingTreeKey(repo);
      write(file, `# ${file}\n`);
      assert.notEqual(workingTreeKey(repo), prev, file);
    }
  });

  it('changes when an app file changes size', () => {
    const prev = workingTreeKey(repo);
    write('apps/web/a.ts', 'export const a = 12345;\n');
    assert.notEqual(workingTreeKey(repo), prev);
  });

  it('tracks size changes of a modified tracked file listed first (" M" status)', () => {
    // Regression: trimmed git output dropped the leading space of " M", which
    // cut the first character of the path, so the file was treated as deleted.
    const git = (args) => spawnSync('git', args, { cwd: repo });
    git(['add', 'apps/web/a.ts']);
    git(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'init']);
    write('apps/web/a.ts', 'export const a = 2;\n');
    const prev = workingTreeKey(repo);
    write('apps/web/a.ts', 'export const a = 23456789;\n');
    assert.notEqual(workingTreeKey(repo), prev);
  });

  it('tracks edits to files with spaces and non-ASCII characters in the name', () => {
    // Regression: `git status` quotes such paths unless -z is used, so statSync
    // failed and an edit that kept the status line unchanged kept the key too.
    const file = 'data/заметки о проекте.md';
    write(file, 'one\n');
    const prev = workingTreeKey(repo);
    write(file, 'one, two\n');
    assert.notEqual(workingTreeKey(repo), prev);
  });
});
