/**
 * Minimal HTTP helpers shared by every panel route: JSON serialization,
 * same-origin enforcement for mutating endpoints, and a size-capped JSON
 * body reader. Mirrors dshmarket's http.ts security model.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Write a JSON payload with no-store caching. */
export declare function sendJson(response: ServerResponse, status: number, payload: unknown): void;
/** True when the request's Origin matches its Host — required on every POST route. */
export declare function sameOrigin(request: IncomingMessage): boolean;
/**
 * Whether a process-control request came from this Web host on loopback.
 * Rejects forwarded/proxied requests: any forwarding trace means the loopback
 * peer is a proxy, not the user (aligned with dshmarket's restart guard).
 */
export declare function trustedLoopbackRequest(request: Pick<IncomingMessage, 'headers' | 'socket'>): boolean;
/** Read and parse a JSON request body, rejecting anything over 4 KiB. */
export declare function readJsonBody(request: IncomingMessage): Promise<unknown>;
//# sourceMappingURL=http.d.ts.map