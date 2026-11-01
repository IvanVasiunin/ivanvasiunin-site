// PreToolUse hook: blocks Claude's file tools from writing secret files.
// Settings deny rules cover reads; this hook is a second, explicit layer for writes.
import path from 'node:path';
import { readHookInput, toRepoPath } from './lib.mjs';

const input = await readHookInput();
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '';
const base = path.basename(filePath).toLowerCase();
const repoPath = toRepoPath(filePath) ?? '';

const reasons = [];
if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
  reasons.push(`${base} holds secrets; only .env.example (placeholders) may be edited`);
}
if (/\.(pem|key|p12|pfx)$/.test(base) || /^id_(rsa|ed25519|ecdsa)/.test(base)) {
  reasons.push(`${base} looks like a private key or certificate`);
}
if (repoPath.startsWith('data/raw/')) {
  reasons.push('data/raw/ contains the private Word CV (phone number) and is read-only');
}

if (reasons.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Blocked by protect-secrets hook: ${reasons.join('; ')}. Ask Ivan to change it manually if really needed.`,
      },
    }),
  );
}
process.exit(0);
