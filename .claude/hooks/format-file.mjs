// PostToolUse hook (Edit|Write): formats and lint-fixes the edited file.
// Remaining lint errors are reported back to Claude via exit code 2 (stderr).
// Tools that are not installed yet (empty skeleton) are skipped silently.
import path from 'node:path';
import { exists, projectDir, readHookInput, run, tail, toRepoPath } from './lib.mjs';

const input = await readHookInput();
const repoPath = toRepoPath(input.tool_input?.file_path);
if (!repoPath || repoPath.startsWith('data/')) process.exit(0); // data/ is edited only with Ivan's OK

const abs = path.join(projectDir, repoPath);
const ext = path.extname(repoPath).toLowerCase();
const problems = [];

const PRETTIER_EXT = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.tsx',
  '.astro',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.css',
  '.scss',
  '.html',
]);
const ESLINT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.tsx', '.astro']);
const STYLELINT_EXT = new Set(['.css', '.scss', '.astro']); // .astro: <style> blocks via postcss-html

if (PRETTIER_EXT.has(ext) && exists('node_modules/.bin/prettier')) {
  run('pnpm', ['exec', 'prettier', '--write', '--ignore-unknown', abs]);
}

if (repoPath.startsWith('apps/web/')) {
  const webDir = path.join(projectDir, 'apps/web');
  if (ESLINT_EXT.has(ext) && exists('apps/web/node_modules/.bin/eslint')) {
    const r = run('pnpm', ['exec', 'eslint', '--fix', abs], { cwd: webDir });
    if (!r.ok) problems.push(`ESLint:\n${tail(r.output)}`);
  }
  if (STYLELINT_EXT.has(ext) && exists('apps/web/node_modules/.bin/stylelint')) {
    const r = run('pnpm', ['exec', 'stylelint', '--fix', abs], { cwd: webDir });
    if (!r.ok) problems.push(`Stylelint:\n${tail(r.output)}`);
  }
}

if (repoPath.startsWith('apps/api/') && ext === '.py' && exists('apps/api/pyproject.toml')) {
  const apiDir = path.join(projectDir, 'apps/api');
  run('uv', ['run', 'ruff', 'format', abs], { cwd: apiDir });
  const r = run('uv', ['run', 'ruff', 'check', '--fix', abs], { cwd: apiDir });
  if (!r.ok) problems.push(`ruff:\n${tail(r.output)}`);
}

if (problems.length > 0) {
  process.stderr.write(
    `Lint problems remain in ${repoPath} after auto-fix:\n\n${problems.join('\n\n')}\n\n` +
      'Fix them (do not disable rules). In the mentor zone, explain the issue to Ivan instead of rewriting his code.',
  );
  process.exit(2);
}
process.exit(0);
