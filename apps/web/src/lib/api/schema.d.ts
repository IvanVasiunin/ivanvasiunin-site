/**
 * GENERATED from the API's OpenAPI schema by `pnpm --dir apps/web run gen:api`.
 * Do not edit by hand: change the Pydantic models in apps/api/src/site_api/schemas/ and regenerate.
 * CI fails when this file is stale (`pnpm --dir apps/web run gen:api:check`).
 */

export interface paths {
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
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
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
