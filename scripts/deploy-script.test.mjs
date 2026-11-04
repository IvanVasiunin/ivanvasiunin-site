// Tests for infra/deploy.sh (node --test): runs the real script in a temp dir with stub `docker` and
// `flock` commands, so tag validation, .env handling and rollback are checked without a server.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);
let dir = '';

/**
 * A stub `docker`: logs each call with the IMAGE_TAG it saw; `pull` / migrations / `up` fail for tags
 * listed in FAIL_PULL / FAIL_MIGRATE / FAIL_UP.
 */
const DOCKER_STUB = `#!/bin/sh
echo "$* IMAGE_TAG=\${IMAGE_TAG:-}" >> "$(dirname "$0")/calls.log"
case "$*" in
  "compose pull --quiet") case " \${FAIL_PULL:-} " in *" \${IMAGE_TAG:-} "*) exit 1;; esac ;;
  "compose run --rm -T api python -m site_api.db.migrate") case " \${FAIL_MIGRATE:-} " in *" \${IMAGE_TAG:-} "*) exit 1;; esac ;;
  "compose up --detach --wait --wait-timeout 180") case " \${FAIL_UP:-} " in *" \${IMAGE_TAG:-} "*) exit 1;; esac ;;
esac
exit 0
`;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'deploy-'));
  copyFileSync('infra/deploy.sh', path.join(dir, 'deploy.sh'));
  writeFileSync(path.join(dir, 'docker'), DOCKER_STUB);
  writeFileSync(path.join(dir, 'flock'), '#!/bin/sh\nexit 0\n');
  for (const file of ['deploy.sh', 'docker', 'flock']) chmodSync(path.join(dir, file), 0o755);
  writeFileSync(path.join(dir, '.env'), `SITE_ADDRESS=example.test\nIMAGE_TAG=${OLD}\n`);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

/**
 * A POSIX sh with the usual tools (sed, grep, tail). On Linux / macOS it is on PATH. On Windows it
 * may not be (the Stop hook runs outside Git Bash), so it is taken from the Git for Windows install.
 * @returns {{ sh: string, toolDirs: string[] }}
 */
function findShell() {
  if (!spawnSync('sh', ['-c', 'exit 0']).error) return { sh: 'sh', toolDirs: [] };
  if (process.platform === 'win32') {
    // `git --exec-path` is <git>/mingw64/libexec/git-core; sh and the tools live in <git>/usr/bin.
    const execPath = spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout?.trim() ?? '';
    const usrBin = path.resolve(execPath, '..', '..', '..', 'usr', 'bin');
    if (execPath && existsSync(path.join(usrBin, 'sh.exe'))) {
      return { sh: path.join(usrBin, 'sh.exe'), toolDirs: [usrBin] };
    }
  }
  throw new Error('No POSIX sh found: install Git for Windows, or run the tests on Linux / macOS.');
}

const SHELL = findShell();

/** Runs deploy.sh like the forced SSH command does: the tag in SSH_ORIGINAL_COMMAND. */
function deploy(tag, env = {}) {
  return spawnSync(SHELL.sh, [path.join(dir, 'deploy.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      // The stubs first, so `docker` and `flock` are ours; then sh's own tools.
      PATH: [dir, ...SHELL.toolDirs, process.env.PATH].join(path.delimiter),
      SSH_ORIGINAL_COMMAND: tag,
      ...env,
    },
  });
}

const envFile = () => readFileSync(path.join(dir, '.env'), 'utf8');
const calls = () => {
  try {
    return readFileSync(path.join(dir, 'calls.log'), 'utf8');
  } catch {
    return '';
  }
};

test('a healthy release is recorded in .env', () => {
  const result = deploy(NEW);
  assert.equal(result.status, 0, result.stderr);
  assert.match(envFile(), new RegExp(`^IMAGE_TAG=${NEW}$`, 'm'));
  assert.match(calls(), new RegExp(`compose up .* IMAGE_TAG=${NEW}`));
});

for (const [name, tag] of [
  ['an injected line', `${NEW}\nWEB_IMAGE=evil/image`],
  ['a short tag', 'abc123'],
  ['uppercase', NEW.toUpperCase()],
  ['shell syntax', `${NEW.slice(0, 39)};`],
  ['an empty tag', ''],
]) {
  test(`${name} is rejected before anything runs`, () => {
    const before = envFile();
    const result = deploy(tag);
    assert.equal(result.status, 2);
    assert.equal(envFile(), before);
    assert.equal(calls(), '');
  });
}

test('migrations of the new release run before it starts', () => {
  const result = deploy(NEW);
  assert.equal(result.status, 0, result.stderr);
  const log = calls();
  const migrate = log.indexOf(
    `compose run --rm -T api python -m site_api.db.migrate IMAGE_TAG=${NEW}`,
  );
  assert.notEqual(migrate, -1, log);
  assert.ok(
    migrate < log.indexOf(`compose up --detach --wait --wait-timeout 180 IMAGE_TAG=${NEW}`),
  );
});

test('the deploy never downgrades the database (a downgrade can drop data)', () => {
  assert.doesNotMatch(readFileSync('infra/deploy.sh', 'utf8'), /downgrade/);
});

test('failed migrations change nothing: no start, no new tag', () => {
  const result = deploy(NEW, { FAIL_MIGRATE: NEW });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /migrations for .* failed/);
  assert.match(envFile(), new RegExp(`^IMAGE_TAG=${OLD}$`, 'm'));
  assert.doesNotMatch(calls(), /compose up/);
});

test('a failed pull changes nothing', () => {
  const result = deploy(NEW, { FAIL_PULL: NEW });
  assert.equal(result.status, 1);
  assert.match(envFile(), new RegExp(`^IMAGE_TAG=${OLD}$`, 'm'));
  assert.doesNotMatch(calls(), /compose up/);
});

test('an unhealthy release rolls back to the previous one and keeps it in .env', () => {
  const result = deploy(NEW, { FAIL_UP: NEW });
  assert.equal(result.status, 1);
  assert.match(envFile(), new RegExp(`^IMAGE_TAG=${OLD}$`, 'm'));
  assert.match(calls(), new RegExp(`compose up .* IMAGE_TAG=${OLD}`));
  assert.match(result.stderr, /rolling back/);
});

test('without a previous release an unhealthy one is reported, not hidden', () => {
  writeFileSync(path.join(dir, '.env'), 'SITE_ADDRESS=example.test\n');
  const result = deploy(NEW, { FAIL_UP: NEW });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no previous release/);
  assert.doesNotMatch(envFile(), /IMAGE_TAG=/);
});
