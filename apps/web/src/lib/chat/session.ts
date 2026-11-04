// The chat session id (SPEC §4.1): a UUID v4 kept in sessionStorage, so it lives as long as the tab
// and the API can apply its per-session limit. It identifies nothing but this conversation.

export const SESSION_STORAGE_KEY = 'elio-session-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The stored id, or a new one. Storage can be missing or throw (private mode, blocked site data);
 * then the id lives only as long as the page.
 */
export function sessionId(
  storage: () => SessionStorage = () => window.sessionStorage,
  newId: () => string = () => crypto.randomUUID(),
): string {
  try {
    const stored = storage().getItem(SESSION_STORAGE_KEY);
    // Storage is untrusted input: anything but a UUID v4 is replaced.
    if (stored !== null && UUID_V4.test(stored)) return stored;
  } catch {
    return newId();
  }
  const id = newId();
  try {
    storage().setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // Not stored: the next page load starts a new session, which is harmless.
  }
  return id;
}
