// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { SESSION_STORAGE_KEY, sessionId } from './session';

const STORED = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const NEW = '0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

describe('sessionId', () => {
  it('reuses the id stored for this tab', () => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: STORED });

    expect(
      sessionId(
        () => storage,
        () => NEW,
      ),
    ).toBe(STORED);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('creates and stores an id on the first question', () => {
    const storage = memoryStorage();

    expect(
      sessionId(
        () => storage,
        () => NEW,
      ),
    ).toBe(NEW);
    expect(storage.setItem).toHaveBeenCalledWith(SESSION_STORAGE_KEY, NEW);
  });

  it('replaces a stored value that is not a UUID v4', () => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: '<script>' });

    expect(
      sessionId(
        () => storage,
        () => NEW,
      ),
    ).toBe(NEW);
  });

  it('still returns an id when storage throws', () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };

    expect(sessionId(blocked, () => NEW)).toBe(NEW);
  });
});
