// @ts-check
// Runs the visual snapshots in the same Linux image CI uses (docs/TESTING.md), so Linux baselines
// can be created and checked from Windows or macOS. Needs Docker.
//
//   pnpm run e2e:visual:linux                       compare with the Linux baselines
//   pnpm run e2e:visual:linux --update-snapshots    create / update them (only with Ivan's OK)
//
// The repository is mounted into the container; node_modules live in Docker volumes, because the
// host's (Windows) binaries cannot run on Linux. The container runs as root, so dependency install
// scripts are not run (`--ignore-scripts`; the image already has the browsers) and `.git` is mounted
// read-only: nothing in the container can plant a git hook that later runs on the host.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pinned by digest, the same reference as the CI `visual` job (scripts/playwright-image.test.mjs).
export const IMAGE =
  'mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Playwright's arguments reach the script as "$@" (separate argv entries), never pasted into the
// command string, so nothing needs quoting.
const SCRIPT = [
  'corepack enable',
  'pnpm install --frozen-lockfile --ignore-scripts',
  'pnpm --dir apps/web exec playwright test --project=visual-chromium "$@"',
].join(' && ');

function main() {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--ipc=host',
      '--env',
      'CI=true',
      '--env',
      'COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
      '--volume',
      `${ROOT}:/repo`,
      '--volume',
      `${path.join(ROOT, '.git')}:/repo/.git:ro`,
      '--volume',
      'ivanvasiunin-site-node-modules:/repo/node_modules',
      '--volume',
      'ivanvasiunin-site-web-node-modules:/repo/apps/web/node_modules',
      '--workdir',
      '/repo',
      IMAGE,
      'bash',
      '-c',
      SCRIPT,
      'visual-linux', // $0 inside the script
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
