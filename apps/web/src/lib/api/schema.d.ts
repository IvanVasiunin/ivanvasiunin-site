/**
 * GENERATED from the API's OpenAPI schema by `pnpm --dir apps/web run gen:api`.
 * Do not edit by hand: change the Pydantic models in apps/api/src/site_api/schemas/ and regenerate.
 * CI fails when this file is stale (`pnpm --dir apps/web run gen:api:check`).
 */

export interface paths {
    "/api/chat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Chat
         * @description Stream Elio's answer: route → sources → token* → usage → done, or a terminal error.
         */
        post: operations["chat_api_chat_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Health
         * @description Report whether the API and its database are up, and which build is running.
         */
        get: operations["health_api_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ChatEvent: components["schemas"]["RouteEvent"] | components["schemas"]["SourcesEvent"] | components["schemas"]["TokenEvent"] | components["schemas"]["UsageEvent"] | components["schemas"]["DoneEvent"] | components["schemas"]["ErrorEvent"];
        /**
         * ChatRequest
         * @description A visitor's question with the client's session and recent history.
         */
        ChatRequest: {
            /** History */
            history?: components["schemas"]["ChatTurn"][];
            /** Message */
            message: string;
            /**
             * Session Id
             * Format: uuid4
             */
            session_id: string;
        };
        /**
         * ChatTurn
         * @description One earlier message of the conversation. Untrusted: it is passed to the model as data.
         */
        ChatTurn: {
            /** Content */
            content: string;
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "assistant";
        };
        /**
         * DoneEvent
         * @description The successful end of the stream.
         */
        DoneEvent: {
            /**
             * Finish Reason
             * @enum {string}
             */
            finish_reason: "stop" | "length" | "templated" | "no_info";
            /**
             * Message Id
             * Format: uuid4
             */
            message_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "done";
        };
        /**
         * ErrorBody
         * @description What went wrong, in terms that are safe to show to a visitor.
         */
        ErrorBody: {
            /**
             * Code
             * @enum {string}
             */
            code: "invalid_request" | "not_found" | "input_too_long" | "rate_limited" | "session_limit" | "budget_exceeded" | "upstream_unavailable" | "timeout" | "internal";
            /** Message */
            message: string;
            /** Retry After S */
            retry_after_s?: number | null;
        };
        /**
         * ErrorEvent
         * @description A failure during the stream; terminal, no `done` follows.
         */
        ErrorEvent: {
            /**
             * Code
             * @enum {string}
             */
            code: "invalid_request" | "not_found" | "input_too_long" | "rate_limited" | "session_limit" | "budget_exceeded" | "upstream_unavailable" | "timeout" | "internal";
            /** Message */
            message: string;
            /**
             * Retry After S
             * @default null
             */
            retry_after_s: number | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "error";
        };
        /**
         * ErrorResponse
         * @description The JSON body of every error response: `{"error": {...}}`.
         */
        ErrorResponse: {
            error: components["schemas"]["ErrorBody"];
        };
        /**
         * HealthResponse
         * @description Liveness of the API and reachability of its database.
         */
        HealthResponse: {
            /**
             * Db
             * @enum {string}
             */
            db: "ok" | "down";
            /**
             * Status
             * @enum {string}
             */
            status: "ok" | "unavailable";
            /** Version */
            version: string;
        };
        /**
         * NodeUsage
         * @description Time and tokens of one graph step (Under the hood, SPEC US-A9).
         */
        NodeUsage: {
            /**
             * Cached Input Tokens
             * @default null
             */
            cached_input_tokens: number | null;
            /**
             * Embedding Tokens
             * @default null
             */
            embedding_tokens: number | null;
            /**
             * Input Tokens
             * @default null
             */
            input_tokens: number | null;
            /**
             * Model
             * @default null
             */
            model: string | null;
            /** Ms */
            ms: number;
            /** Name */
            name: string;
            /**
             * Output Tokens
             * @default null
             */
            output_tokens: number | null;
        };
        /**
         * RouteEvent
         * @description The router's decision; always the first event.
         */
        RouteEvent: {
            /** Language */
            language: string;
            /**
             * Route
             * @enum {string}
             */
            route: "about_ivan" | "greeting" | "off_topic" | "injection";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "route";
        };
        /**
         * SourceItem
         * @description One retrieved chunk above the relevance threshold.
         */
        SourceItem: {
            /** Chunk Id */
            chunk_id: string;
            /** Score */
            score: number;
            /**
             * Section
             * @default null
             */
            section: string | null;
            /** Snippet */
            snippet: string;
            /**
             * Source Type
             * @enum {string}
             */
            source_type: "cv" | "experience" | "personal" | "site_docs" | "github_readme";
            /** Title */
            title: string;
            /**
             * Url
             * @default null
             */
            url: string | null;
        };
        /**
         * SourcesEvent
         * @description Retrieved sources, by score descending.
         *
         *     An empty list means nothing was relevant; a templated "no information" answer follows.
         */
        SourcesEvent: {
            /** Items */
            items: components["schemas"]["SourceItem"][];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "sources";
        };
        /**
         * TokenEvent
         * @description The next piece of the answer, in Markdown.
         */
        TokenEvent: {
            /** Text */
            text: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "token";
        };
        /**
         * UsageEvent
         * @description Per-step timings and tokens; sent once, right before `done`.
         */
        UsageEvent: {
            /** Estimated Cost Usd */
            estimated_cost_usd: number;
            /** Nodes */
            nodes: components["schemas"]["NodeUsage"][];
            /** Total Ms */
            total_ms: number;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "usage";
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    chat_api_chat_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChatRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": unknown;
                };
            };
            /** @description Question too long (SPEC §4.3) */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Invalid request (SPEC §4.3) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate or session limit (SPEC §4.3) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Chat unavailable or daily budget spent (SPEC §4.3) */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Error (SPEC §4.3) */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    health_api_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            /** @description Invalid request (SPEC §4.3) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            /** @description Error (SPEC §4.3) */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
}
