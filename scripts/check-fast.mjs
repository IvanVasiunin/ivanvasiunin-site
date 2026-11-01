#!/usr/bin/env node
// Fast checks for the monorepo: format, lint, typecheck, unit + component tests.
// Tests marked `mentor_pending` are excluded (docs/TESTING.md §4).
//
// Usage:
//   node scripts/check-fast.mjs              # all targets (web, api, scripts)
//   node scripts/check-fast.mjs web api      # selected targets
//   node scripts/check-fast.mjs --changed    # targets with uncommitted changes only
//   node scripts/check-fast.mjs --strict web # CI: fail instead of skipping a missing target
//
// Used by the Claude Code Stop hook, lefthook and humans alike, so there is a
// single definition of "fast checks". Apps that are not initialized are skipped.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

// On Windows the steps run with `shell: true` (pnpm is a .cmd shim), which joins
// the arguments into one command line, so an argument with spaces must be quoted.
// Only for the static arguments in APPS below: quotes and cmd metacharacters are not escaped.
const shellArg = (arg) => (isWindows && /\s/.test(arg) ? `"${arg}"` : arg);

// `paths` are the path prefixes whose changes select the target with --changed.
const APPS = {
  web: {
    marker: 'apps/web/package.json',
    cwd: 'apps/web',
    paths: ['apps/web/'],
    steps: [['pnpm', ['run', 'check:fast']]],
  },
  api: {
    marker: 'apps/api/pyproject.toml',
    cwd: 'apps/api',
    paths: ['apps/api/'],
    steps: [
      ['uv', ['run', 'ruff', 'format', '--check', '.']],
      ['uv', ['run', 'ruff', 'check', '.']],
      ['uv', ['run', 'pyright']],
      ['uv', ['run', 'pytest', '-m', 'not mentor_pending', '-q']],
    ],
  },
  // Repo-level Node scripts, the git-hook configs they test, and CI workflows.
  scripts: {
    marker: 'scripts/check-commit-msg.test.mjs',
    cwd: '.',
    paths: ['scripts/', 'lefthook.yml', '.gitleaks.toml', '.github/'],
    steps: [
      ['pnpm', ['exec', 'prettier', '--check', 'scripts', 'lefthook.yml', '.github']],
      ['node', ['--test', 'scripts/*.test.mjs']],
    ],
  },
};

function changedApps() {
  const status = spawnSync('git', ['status', '--porcelain', '-uall'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.status !== 0) return Object.keys(APPS); // not a git repo: check everything
  const files = status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'));
  return Object.keys(APPS).filter((app) =>
    files.some((f) => APPS[app].paths.some((p) => f.startsWith(p))),
  );
}

const args = process.argv.slice(2);
// --strict (used in CI): a missing app is an error, so deleting or renaming its
// marker file cannot turn a CI job green without running any check.
const strict = args.includes('--strict');
const names = args.filter((a) => !a.startsWith('--'));
const selected = args.includes('--changed')
  ? changedApps()
  : names.length > 0
    ? names
    : Object.keys(APPS);

let failed = false;
for (const name of selected) {
  const app = APPS[name];
  if (!app) {
    console.error(`Unknown app "${name}". Known: ${Object.keys(APPS).join(', ')}`);
    process.exit(2);
  }
  if (!existsSync(path.join(root, app.marker))) {
    if (strict) {
      failed = true;
      console.log(`[${name}] ✘ ${app.marker} missing (--strict: skipping is not allowed)`);
    } else {
      console.log(`[${name}] skipped: not initialized (${app.marker} missing)`);
    }
    continue;
  }
  for (const [cmd, cmdArgs] of app.steps) {
    const label = `[${name}] ${cmd} ${cmdArgs.join(' ')}`;
    const r = spawnSync(cmd, cmdArgs.map(shellArg), {
      cwd: path.join(root, app.cwd),
      encoding: 'utf8',
      shell: isWindows,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    if (r.status === 0) {
      console.log(`${label} ✔`);
    } else {
      failed = true;
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split(/\r?\n/).slice(-60).join('\n');
      console.log(`${label} ✘ (exit ${r.status ?? r.error?.message})\n${out}\n`);
    }
  }
}

if (selected.length === 0) console.log('No app changes: fast checks skipped.');
process.exit(failed ? 1 : 0);
