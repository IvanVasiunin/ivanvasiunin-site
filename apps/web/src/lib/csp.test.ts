// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { cspHash } from './csp';

describe('cspHash', () => {
  test('is the base64 SHA-256 of the exact text, as browsers compute it', () => {
    // echo -n "alert(1)" | openssl dgst -sha256 -binary | base64
    expect(cspHash('alert(1)')).toBe('sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI=');
  });

  test('changes with any whitespace difference', () => {
    expect(cspHash('a;')).not.toBe(cspHash('a; '));
  });
});
