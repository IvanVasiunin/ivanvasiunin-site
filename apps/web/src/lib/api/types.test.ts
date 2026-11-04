import { describe, expectTypeOf, test } from 'vitest';
import type {
  ChatEvent,
  ChatEventType,
  ChatRequest,
  ErrorCode,
  ErrorResponse,
  HealthResponse,
  SourceType,
} from './types';

// Type-level checks on the generated contract. `expectTypeOf` is checked by the typecheck
// (`tsc --noEmit` in check:fast), not at runtime: when the API changes a shape the frontend relies
// on, the typecheck fails and the UI is updated with it.
describe('API contract types', () => {
  test('error codes are exactly the codes of SPEC §4.2 / §4.3', () => {
    expectTypeOf<ErrorCode>().toEqualTypeOf<
      | 'invalid_request'
      | 'not_found'
      | 'input_too_long'
      | 'rate_limited'
      | 'session_limit'
      | 'budget_exceeded'
      | 'upstream_unavailable'
      | 'timeout'
      | 'internal'
    >();
  });

  test('an error body has a code, a message and an optional retry delay', () => {
    expectTypeOf<ErrorResponse['error']['code']>().toEqualTypeOf<ErrorCode>();
    expectTypeOf<ErrorResponse['error']['message']>().toEqualTypeOf<string>();
    expectTypeOf<ErrorResponse['error']>().toHaveProperty('retry_after_s');
  });

  test('the health response reports the database and the build', () => {
    expectTypeOf<HealthResponse['status']>().toEqualTypeOf<'ok' | 'unavailable'>();
    expectTypeOf<HealthResponse['db']>().toEqualTypeOf<'ok' | 'down'>();
    expectTypeOf<HealthResponse['version']>().toEqualTypeOf<string>();
  });

  test('chat events are the six types of SPEC §4.2', () => {
    expectTypeOf<ChatEventType>().toEqualTypeOf<
      'route' | 'sources' | 'token' | 'usage' | 'done' | 'error'
    >();
    expectTypeOf<Extract<ChatEvent, { type: 'token' }>['text']>().toEqualTypeOf<string>();
    expectTypeOf<Extract<ChatEvent, { type: 'error' }>['code']>().toEqualTypeOf<ErrorCode>();
  });

  test('a source has one of the five source types of the map key', () => {
    expectTypeOf<SourceType>().toEqualTypeOf<
      'cv' | 'experience' | 'personal' | 'site_docs' | 'github_readme'
    >();
  });

  test('a chat request carries the message, the session and optional history', () => {
    expectTypeOf<ChatRequest['message']>().toEqualTypeOf<string>();
    expectTypeOf<ChatRequest['session_id']>().toEqualTypeOf<string>();
    expectTypeOf<ChatRequest>().toHaveProperty('history');
  });
});
