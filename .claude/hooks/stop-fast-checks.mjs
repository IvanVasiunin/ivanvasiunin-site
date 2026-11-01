// Stop hook: runs fast checks (format, lint, typecheck, unit + component tests,
// excluding `mentor_pending`) for every app with uncommitted changes.
// If something is red, it blocks the stop so Claude keeps working.
//
// Loop protection:
// - The failure is identified by a normalized fingerprint (failing step labels and
//   file:line / test ids, with durations stripped), not by the raw output.
// - If Claude already continued once (`stop_hook_active`) and the failure is the
//   same, Claude could not or must not fix it (e.g. Ivan's mentor-zone code). The
//   stop is allowed and the failure is "acknowledged".
// - An acknowledged failure is not blocked again on later turns until it changes
//   or the checks turn green. The user still sees a short reminder.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectDir, readHookInput, run, workingTreeKey } from './lib.mjs';

// Overridable only for testing the hook itself.
const CHECK_SCRIPT = process.env.CLAUDE_STOP_CHECK_SCRIPT ?? 'scripts/check-fast.mjs';
const sha1 = (text) => createHash('sha1').update(text).digest('hex');

// Identity of a failure: which steps failed and where, without timings or counts
// that change between identical runs.
export function failureFingerprint(output) {
  const relevant = output
    .split(/\r?\n/)
    .filter((l) => /✘|FAIL|ERROR|[Ee]rror|\.(py|ts|tsx|astro|scss|css|mjs):\d+/.test(l))
    .map((l) =>
      l
        .replace(/\b\d+(\.\d+)?\s?(ms|s|sec|seconds)\b/g, '')
        .replace(/\(exit [^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  return sha1([...new Set(relevant)].sort().join('\n'));
}

const statePath = path.join(projectDir, '.claude/.cache/stop-fast-checks.json');
const readState = () => {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
};
const writeState = (state) => {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
};

const input = await readHookInput();
const state = readState();
// Same working-tree fingerprint as the last green run: nothing changed, skip the checks.
const treeKey = workingTreeKey();
if (state.lastGreen === treeKey) process.exit(0);

const result = run('node', [CHECK_SCRIPT, '--changed'], { timeoutMs: 540_000 });
if (result.ok) {
  writeState({ lastGreen: treeKey });
  process.exit(0);
}

const fingerprint = failureFingerprint(result.output);
const allow = (message, nextState) => {
  writeState(nextState);
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
};

if (state.acknowledged === fingerprint) {
  allow(
    'Fast checks are still red with the same, already reported failure (not blocking again).',
    state,
  );
}
if (input.stop_hook_active && state.lastFailure === fingerprint) {
  allow(
    'Fast checks are still red after a retry with the same failures. Stopping so the failure can be reviewed (it may be in mentor-zone code).',
    { acknowledged: fingerprint },
  );
}

writeState({ lastFailure: fingerprint, acknowledged: state.acknowledged });
process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason:
      'Fast checks failed. Fix the failures before finishing, without weakening or skipping tests ' +
      '(see .claude/rules/testing.md). If the failure is in mentor-zone code written by Ivan ' +
      '(apps/api/src/site_api/{ingestion,rag,graph,prompts,evals}), do not rewrite it: explain the ' +
      `problem in your report instead.\n\n${result.output.slice(-6000)}`,
  }),
);
process.exit(0);
