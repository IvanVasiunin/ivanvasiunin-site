// Friendly names for the generated API contract types (schema.d.ts, ROADMAP 1.5).
// The only place the frontend gets API types from: hand-written copies are forbidden
// (typescript.md), so a change in the API's Pydantic models reaches the UI through `gen:api`.
import type { components } from './schema';

type Schemas = components['schemas'];

/** `GET /api/health` (SPEC §4.5). */
export type HealthResponse = Schemas['HealthResponse'];

/** The unified error body (SPEC §4.3): `{ error: { code, message, retry_after_s? } }`. */
export type ErrorResponse = Schemas['ErrorResponse'];

/** Every error code the API can return; the UI maps each one to a message (SPEC §3, error states). */
export type ErrorCode = Schemas['ErrorBody']['code'];
