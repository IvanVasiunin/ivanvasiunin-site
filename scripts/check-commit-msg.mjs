#!/usr/bin/env node
// Conventional Commits check for the lefthook `commit-msg` hook (.claude/rules/git.md).
//
// Usage: node scripts/check-commit-msg.mjs <path to the commit message file>
//
// A dependency-free script instead of commitlint: the rule is one regular
// expression, and a dev dependency tree for it would not pay for itself.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TYPES = [
  'feat',
  'fix',
  'chore',
  'docs',
  'test',
  'refactor',
  'ci',
  'build',
  'perf',
  'style',
  'revert',
];
export const MAX_SUBJECT_LENGTH = 100;

const SUBJECT = new RegExp(`^(?:${TYPES.join('|')})(?:\\([a-z0-9-]+\\))?!?: \\S`);
// Messages git writes itself (merge commits, `git revert`) are accepted as is.
const GIT_GENERATED = /^(?:Merge |Revert ")/;

/**
 * Returns an error message for an invalid commit message, or null when it is valid.
 * @param {string} message Full commit message, possibly with `#` comment lines.
 * @returns {string | null}
 */
export function checkCommitMessage(message) {
  const subject = message
    .split(/\r?\n/)
    .find((line) => line.trim() !== '' && !line.startsWith('#'));
  if (subject === undefined) return 'Commit message is empty.';
  if (GIT_GENERATED.test(subject)) return null;
  if (!SUBJECT.test(subject)) {
    return (
      `Subject "${subject}" is not a Conventional Commit.\n` +
      `Expected "<type>(<optional scope>): <description>", type one of: ${TYPES.join(', ')}.\n` +
      'Example: "feat(web): add Brief / Full switch"'
    );
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Subject is ${subject.length} characters long; the limit is ${MAX_SUBJECT_LENGTH}.`;
  }
  return null;
}

const isEntryPoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/check-commit-msg.mjs <commit message file>');
    process.exit(2);
  }
  const error = checkCommitMessage(readFileSync(file, 'utf8'));
  if (error) {
    console.error(`✘ ${error}`);
    process.exit(1);
  }
}
