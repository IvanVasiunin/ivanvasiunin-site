// Test vectors for the phone-number rules in .gitleaks.toml (golden rule 5).
// Runs the real gitleaks binary, so the rules are tested in Go's regexp engine.
//
// No phone number may be written in the repo, not even a fake one, so inputs are
// templates: every "N" becomes "0" at runtime.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = path.join(root, '.gitleaks.toml');
const fill = (template) => template.replaceAll('N', '0');

/** gitleaks from GITLEAKS_BIN, PATH, or winget's package folder (on PATH only in new shells). */
function findGitleaks() {
  if (process.env.GITLEAKS_BIN) return process.env.GITLEAKS_BIN;
  if (spawnSync('gitleaks', ['version']).status === 0) return 'gitleaks';
  const packages = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  if (!existsSync(packages)) return null;
  const dir = readdirSync(packages).find((name) => name.startsWith('Gitleaks.Gitleaks_'));
  const exe = dir ? path.join(packages, dir, 'gitleaks.exe') : '';
  return exe && existsSync(exe) ? exe : null;
}

const gitleaks = findGitleaks();

/** True when gitleaks reports a finding for the text (exit code 1). */
function isFlagged(text) {
  const r = spawnSync(gitleaks, ['stdin', '-c', config, '--no-banner', '--log-level', 'error'], {
    input: `${text}\n`,
    encoding: 'utf8',
  });
  assert.ok(r.status === 0 || r.status === 1, `gitleaks failed: ${r.stderr || r.error}`);
  return r.status === 1;
}

describe('gitleaks phone-number rules', () => {
  it('finds the gitleaks binary (install: see README "Getting started")', () => {
    assert.ok(gitleaks, 'gitleaks not found on PATH, in GITLEAKS_BIN or in the winget folder');
  });

  it('flags phone numbers in common formats', () => {
    for (const template of [
      '+7 9NN NNN-NN-NN',
      '+7(9NN)NNNNNNN',
      '+NN (NN) NNNN NNNN',
      '+N-NNN-NNN-NNNN',
      'tel:+7NNNNNNNNNN',
      '%2B7NNNNNNNNNN',
      'NN NN NN NNNN NNNN',
      '+7 9NN NNN–NN–NN',
      '7 9NN NNN NN NN',
      '79NNNNNNNNN',
      '8 (9NN) NNN-NN-NN',
      '8 4NN NNN NN NN',
      '8 8NN NNN-NN-NN',
      '8.9NN.NNN.NN.NN',
      '(4NN) NNN-NN-NN',
      '9NNNNNNNNN',
    ]) {
      assert.equal(isFlagged(`Contact: ${fill(template)}`), true, template);
    }
  });

  it('ignores versions, dates, ports, timestamps and base64', () => {
    for (const text of [
      'astro 7.4.4, pytest 9.2.0',
      'released 2026-11-01T09:47:33Z',
      'DATABASE_URL port 5432',
      '+100% faster',
      'timestamp 1730000000, id 12345678901',
      'integrity: sha512-AbCdEfGh+1234567890/IjKlMnOp+12345678==',
      'data:font/woff2;base64,AAEAAA+1234567/zz',
    ]) {
      assert.equal(isFlagged(text), false, text);
    }
  });
});
