/**
 * Market integration (F17): the curated DSH plugin registry behind
 * dshmarket — awesome-dsh-plugin.com/plugins.json — with a local snapshot
 * fallback (the `data/registry-snapshot.json` shipped inside an installed
 * dshmarket), keyword search, and install-target resolution that mirrors
 * dshmarket's mapping exactly: an entry with a valid `npm` name installs
 * from the npm registry; every other entry installs from GitHub as
 * `github:owner/repo[#path:/sub]`.
 *
 * This module is pure of the host: fetch and snapshot locations are
 * injectable so unit tests never touch the network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/** GitHub `owner/repo` shape (mirrors dshmarket's sources.ts). */
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
/** Registry npm names must be plain npm package names, nothing fancier. */
const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
/**
 * Parse a registry source url: a GitHub repo, optionally with a
 * `/tree/<branch>/<subpath>` suffix (how the curated list links monorepo
 * subpackages, e.g. a collection repo's theme-gallery piece).
 */
export function parseSourceUrl(url) {
    const m = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\/tree\/[^/]+\/(.+?))?\/?$/.exec(url);
    if (m === null || !REPO_RE.test(m[1] ?? ''))
        return null;
    const subpath = m[2] ?? null;
    if (subpath !== null) {
        if (!/^[A-Za-z0-9_./-]+$/.test(subpath))
            return null;
        // No empty/dot segments: `..` would escape the repo in the #path: selector.
        if (subpath.split('/').some(seg => seg === '' || seg === '.' || seg === '..'))
            return null;
    }
    return { repo: m[1], subpath };
}
/** The pnpm install target for a registry entry, or null when unsupported. */
export function resolveMarketTarget(entry) {
    const source = parseSourceUrl(entry.url);
    if (source === null)
        return null;
    if (typeof entry.npm === 'string' && NPM_NAME_RE.test(entry.npm))
        return entry.npm;
    return source.subpath !== null
        ? `github:${source.repo}#path:/${source.subpath}`
        : `github:${source.repo}`;
}
/** Whether an install target is GitHub-hosted (github: prefix). */
export function isGithubTarget(target) {
    return target.startsWith('github:');
}
/** Coerce an entry's bilingual description to one display string. */
function describe(entry) {
    const raw = entry.description;
    if (typeof raw === 'string' && raw.trim() !== '')
        return raw.trim();
    if (raw !== null && typeof raw === 'object') {
        const picked = raw.zh ?? raw.en ?? raw['zh-CN'] ?? null;
        if (typeof picked === 'string' && picked.trim() !== '')
            return picked.trim();
        for (const value of Object.values(raw)) {
            if (typeof value === 'string' && value.trim() !== '')
                return value.trim();
        }
    }
    return null;
}
/** Fold one raw entry into a search hit; null when it has no installable source. */
export function toMarketHit(entry) {
    const target = resolveMarketTarget(entry);
    if (target === null)
        return null;
    const source = parseSourceUrl(entry.url);
    return {
        name: entry.name,
        owner: source?.repo.split('/')[0] ?? null,
        url: entry.url,
        category: typeof entry.category === 'string' && entry.category !== '' ? entry.category : null,
        description: describe(entry),
        npm: typeof entry.npm === 'string' && entry.npm !== '' ? entry.npm : null,
        stars: typeof entry.stars === 'number' ? entry.stars : null,
        added: typeof entry.added === 'string' ? entry.added : null,
        kind: isGithubTarget(target) ? 'github' : 'npm',
        installTarget: target,
    };
}
/** Lower-cased keyword tokens of a query (max 8, each capped at 32 chars). */
export function tokenize(query) {
    return query.toLowerCase().split(/\s+/).map(token => token.trim()).filter(Boolean).slice(0, 8)
        .map(token => token.slice(0, 32));
}
/**
 * Search the loaded registry. Matching is keyword-based against name /
 * owner / category / description / npm alias; ranking puts name-prefix
 * matches first, then exact token hits, then stars (desc), then name.
 * An empty query returns the top-starred entries.
 */
export function searchMarket(registry, query, limit = 8) {
    const tokens = tokenize(query);
    const fold = (entry) => [
        entry.name,
        entry.owner ?? '',
        entry.category ?? '',
        describe(entry) ?? '',
        typeof entry.npm === 'string' ? entry.npm : '',
    ].join(' ').toLowerCase();
    const scored = [];
    for (const entry of registry.plugins) {
        const hit = toMarketHit(entry);
        if (hit === null)
            continue;
        if (tokens.length === 0) {
            scored.push({ hit, score: hit.stars ?? 0 });
            continue;
        }
        const hay = fold(entry);
        let score = 0;
        for (const token of tokens) {
            if (!hay.includes(token)) {
                score = -1;
                break;
            }
            if (hit.name.toLowerCase().startsWith(token))
                score += 10;
            else if (hit.name.toLowerCase().includes(token))
                score += 6;
            else if (hit.npm !== null && hit.npm.toLowerCase().includes(token))
                score += 5;
            else
                score += 2;
        }
        if (score < 0)
            continue;
        scored.push({ hit, score: score * 1000 + (hit.stars ?? 0) });
    }
    scored.sort((a, b) => b.score - a.score || a.hit.name.localeCompare(b.hit.name));
    const results = scored.slice(0, limit).map(row => row.hit);
    return { hits: results, total: scored.length };
}
/* ------------------------------------------------------------------ */
/* Loading: live registry → snapshot fallback, with a TTL cache        */
/* ------------------------------------------------------------------ */
export const MARKET_URL = process.env.DSH_PROFILE_PANEL_MARKET_URL || 'https://awesome-dsh-plugin.com/plugins.json';
/** Read dshmarket's bundled snapshot from one profile dir, or null. */
export function readMarketSnapshot(profileDirs) {
    for (const dir of profileDirs) {
        const path = join(dir, 'node_modules', 'dshmarket', 'data', 'registry-snapshot.json');
        try {
            const parsed = JSON.parse(readFileSync(path, 'utf8'));
            if (parsed !== null && typeof parsed === 'object'
                && Array.isArray(parsed.plugins)
                && parsed.plugins.length > 0) {
                return parsed;
            }
        }
        catch { /* try the next profile dir */ }
    }
    return null;
}
/** Shape-check a wire payload as a market registry. */
function isRegistry(value) {
    return value !== null && typeof value === 'object'
        && Array.isArray(value.plugins)
        && value.plugins.length > 0;
}
/**
 * Build the market service. `profileDirs()` is called lazily per fetch so a
 * late `pnpm install dshmarket` in another profile is picked up.
 */
export function createMarketService(options) {
    const fetchFn = options.fetchFn ?? globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? 4000;
    const ttlMs = options.ttlMs ?? 60_000;
    const liveUrl = options.liveUrl ?? MARKET_URL;
    let cache = null;
    async function load() {
        const now = options.now?.() ?? Date.now();
        if (cache !== null && now - cache.at < ttlMs) {
            return { registry: cache.data, source: cache.source };
        }
        try {
            const response = await fetchFn(liveUrl, { signal: AbortSignal.timeout(timeoutMs) });
            if (response.ok) {
                const data = await response.json();
                if (isRegistry(data)) {
                    cache = { at: now, data, source: 'live' };
                    return { registry: data, source: 'live' };
                }
            }
        }
        catch { /* offline / timeout — fall back to the snapshot */ }
        const snapshot = readMarketSnapshot(options.profileDirs());
        if (snapshot !== null) {
            cache = { at: now, data: snapshot, source: 'snapshot' };
            return { registry: snapshot, source: 'snapshot', warning: 'market live registry unavailable — using the dshmarket snapshot' };
        }
        return {
            registry: null,
            source: 'none',
            warning: 'market registry unavailable (offline and no dshmarket snapshot on disk)',
        };
    }
    async function search(query, limit = 8) {
        const loaded = await load();
        if (loaded.registry === null) {
            return {
                ok: false,
                source: 'none',
                updated: null,
                total: 0,
                query,
                results: [],
                warning: loaded.warning,
            };
        }
        const { hits, total } = searchMarket(loaded.registry, query, limit);
        return {
            ok: true,
            source: loaded.source,
            updated: loaded.registry.updated ?? null,
            total,
            query,
            results: hits,
            ...(loaded.warning !== undefined ? { warning: loaded.warning } : {}),
        };
    }
    return {
        search,
        refresh: () => {
            cache = null;
            return search('');
        },
    };
}
