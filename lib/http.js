/**
 * Minimal HTTP helpers shared by every panel route: JSON serialization,
 * same-origin enforcement for mutating endpoints, and a size-capped JSON
 * body reader. Mirrors dshmarket's http.ts security model.
 */
/** Write a JSON payload with no-store caching. */
export function sendJson(response, status, payload) {
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(payload));
}
/** True when the request's Origin matches its Host — required on every POST route. */
export function sameOrigin(request) {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin === undefined || host === undefined)
        return false;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
}
/**
 * Whether a process-control request came from this Web host on loopback.
 * Rejects forwarded/proxied requests: any forwarding trace means the loopback
 * peer is a proxy, not the user (aligned with dshmarket's restart guard).
 */
export function trustedLoopbackRequest(request) {
    const address = request.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    if (request.headers.forwarded !== undefined
        || request.headers['x-forwarded-for'] !== undefined
        || request.headers['x-real-ip'] !== undefined)
        return false;
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin === undefined || host === undefined)
        return false;
    try {
        const parsed = new URL(origin);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host;
    }
    catch {
        return false;
    }
}
/** Read and parse a JSON request body, rejecting anything over 4 KiB. */
export async function readJsonBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 4096)
            throw new Error('request body too large');
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
