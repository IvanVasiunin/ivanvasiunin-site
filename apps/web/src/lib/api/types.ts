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

/** `POST /api/chat` request body (SPEC §4.1). */
export type ChatRequest = Schemas['ChatRequest'];

/** One earlier message sent back as `history`. */
export type ChatTurn = Schemas['ChatTurn'];

/** One event of the chat stream (SPEC §4.2), discriminated by `type`. */
export type ChatEvent = Schemas['ChatEvent'];

/** The `type` of a chat event: `route`, `sources`, `token`, `usage`, `done` or `error`. */
export type ChatEventType = ChatEvent['type'];

/** One retrieved source of an answer (the `sources` event). */
export type SourceItem = Schemas['SourceItem'];

/** The kind of a source; each has its colour on the map and in the source list. */
export type SourceType = SourceItem['source_type'];
