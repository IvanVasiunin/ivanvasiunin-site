import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkCommitMessage, MAX_SUBJECT_LENGTH } from './check-commit-msg.mjs';

describe('checkCommitMessage', () => {
  it('accepts every allowed type, with and without scope', () => {
    for (const subject of [
      'feat: add CV page',
      'fix(api): handle empty question',
      'chore(deps): bump astro',
      'docs: update ROADMAP',
      'refactor(web)!: rename chat store',
    ]) {
      assert.equal(checkCommitMessage(subject), null, subject);
    }
  });

  it('checks only the first non-comment line and ignores the body', () => {
    const message = '# Please enter the commit message\n\nfeat: add CV page\n\nLonger body.\n';
    assert.equal(checkCommitMessage(message), null);
  });

  it('accepts messages that git generates itself', () => {
    assert.equal(checkCommitMessage("Merge branch 'feat/cv' into main"), null);
    assert.equal(checkCommitMessage('Revert "feat: add CV page"'), null);
  });

  it('rejects unknown types, missing space and missing description', () => {
    for (const subject of [
      'added CV page',
      'feature: add CV page',
      'feat:add CV page',
      'feat: ',
      'Feat: add CV page',
      'feat(Web): add CV page',
    ]) {
      assert.match(checkCommitMessage(subject) ?? '', /not a Conventional Commit/, subject);
    }
  });

  it('rejects an empty message', () => {
    assert.equal(checkCommitMessage('# only comments\n\n'), 'Commit message is empty.');
  });

  it('rejects a subject over the length limit', () => {
    const subject = `feat: ${'x'.repeat(MAX_SUBJECT_LENGTH)}`;
    assert.match(checkCommitMessage(subject) ?? '', /limit is 100/);
  });
});
