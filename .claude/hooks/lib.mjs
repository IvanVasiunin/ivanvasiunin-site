// Shared helpers for Claude Code hooks. Plain Node.js (no dependencies) so the
// hooks run the same way on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());

/** Reads the hook input JSON from stdin. Returns {} on empty or invalid input. */
export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    // Strip a UTF-8 BOM: Windows PowerShell 5.1 adds one when piping strings.
    const text = Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '');
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

/** Repo-relative path with forward slashes, or null if the file is outside the repo. */
export function toRepoPath(filePath) {
  if (!filePath) return null;
  const rel = path.relative(projectDir, path.resolve(projectDir, filePath));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

export function exists(repoPath) {
  return existsSync(path.join(projectDir, repoPath));
}

/**
 * Runs a command and captures its output. `shell: true` on Windows lets us call
 * `.cmd` shims such as pnpm and npx without hard-coding extensions.
 */
export function run(command, args, { cwd = projectDir, timeoutMs = 240_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    error: result.error?.message,
  };
}

/** Keeps the last `maxLines` lines so hook feedback does not flood the context. */
export function tail(text, maxLines = 40) {
  const lines = text.split(/\r?\n/);
  return lines.length <= maxLines ? text : ['…', ...lines.slice(-maxLines)].join('\n');
}
