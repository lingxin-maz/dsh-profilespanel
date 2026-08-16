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
/** One curated registry entry (subset the panel consumes). */
export interface MarketEntryRaw {
    name: string;
    owner?: string;
    url: string;
    category?: string;
    description?: Record<string, string> | string | null;
    npm?: string | null;
    stars?: number | null;
    install?: string;
    added?: string;
}
export interface MarketRegistry {
    updated?: string;
    count?: number;
    categories?: Record<string, Record<string, string>>;
    plugins: MarketEntryRaw[];
}
/**
 * Parse a registry source url: a GitHub repo, optionally with a
 * `/tree/<branch>/<subpath>` suffix (how the curated list links monorepo
 * subpackages, e.g. a collection repo's theme-gallery piece).
 */
export declare function parseSourceUrl(url: string): {
    repo: string;
    subpath: string | null;
} | null;
/** The pnpm install target for a registry entry, or null when unsupported. */
export declare function resolveMarketTarget(entry: Pick<MarketEntryRaw, 'url' | 'npm'>): string | null;
/** Whether an install target is GitHub-hosted (github: prefix). */
export declare function isGithubTarget(target: string): boolean;
/** One search result row handed to the panel UI. */
export interface MarketHit {
    name: string;
    owner: string | null;
    url: string;
    category: string | null;
    description: string | null;
    npm: string | null;
    stars: number | null;
    added: string | null;
    /** 'npm' when the registry maps it to an npm name, else 'github'. */
    kind: 'npm' | 'github';
    /** The ready-to-`pnpm add` target (npm name or github:owner/repo#path:/sub). */
    installTarget: string;
}
export interface MarketSearchPayload {
    ok: boolean;
    source: 'live' | 'cache' | 'snapshot' | 'none';
    updated: string | null;
    total: number;
    query: string;
    results: MarketHit[];
    /** Present when the registry could not be loaded at all. */
    warning?: string;
}
/** Fold one raw entry into a search hit; null when it has no installable source. */
export declare function toMarketHit(entry: MarketEntryRaw): MarketHit | null;
/** Lower-cased keyword tokens of a query (max 8, each capped at 32 chars). */
export declare function tokenize(query: string): string[];
/**
 * Search the loaded registry. Matching is keyword-based against name /
 * owner / category / description / npm alias; ranking puts name-prefix
 * matches first, then exact token hits, then stars (desc), then name.
 * An empty query returns the top-starred entries.
 */
export declare function searchMarket(registry: MarketRegistry, query: string, limit?: number): {
    hits: MarketHit[];
    total: number;
};
export declare const MARKET_URL: string;
/** Structural fetch surface (injectable in tests). */
export interface MarketFetch {
    (url: string, init?: {
        signal?: AbortSignal;
    }): Promise<{
        ok: boolean;
        status: number;
        json(): Promise<unknown>;
    }>;
}
/** Structural clock/sleep surface (injectable in tests). */
export interface MarketServiceOptions {
    /** Snapshot search roots (profile dirs holding a dshmarket install). */
    profileDirs: () => string[];
    fetchFn?: MarketFetch;
    now?: () => number;
    timeoutMs?: number;
    ttlMs?: number;
    liveUrl?: string;
}
/** Read dshmarket's bundled snapshot from one profile dir, or null. */
export declare function readMarketSnapshot(profileDirs: string[]): MarketRegistry | null;
export interface MarketService {
    /** Search the market registry (live with TTL, falling back to snapshots). */
    search(query: string, limit?: number): Promise<MarketSearchPayload>;
    /** Force-refresh the cached registry (used by tests and future UI). */
    refresh(): Promise<MarketSearchPayload>;
}
/**
 * Build the market service. `profileDirs()` is called lazily per fetch so a
 * late `pnpm install dshmarket` in another profile is picked up.
 */
export declare function createMarketService(options: MarketServiceOptions): MarketService;
//# sourceMappingURL=market.d.ts.map