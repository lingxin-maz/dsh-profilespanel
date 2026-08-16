/**
 * F9 boot report: a read of the official loader projection
 * (`ctx.loader.entries()`, same shape dsh-host-plugin-inventory exposes) —
 * which bundle layers activated and which failed. Read-only, live.
 */
/**
 * Project loader entries into the report shape; never throws. The cordis
 * loader's `entries()` is a GENERATOR (iterable, not an array), and entry
 * shapes may drift across harness versions — every stage degrades to an
 * empty report instead of failing the route.
 */
export function readLoaderEntries(loader) {
    if (loader === undefined)
        return [];
    let raw;
    try {
        raw = loader.entries();
    }
    catch {
        return [];
    }
    const entries = [];
    try {
        for (const entry of raw) {
            const record = entry;
            const phase = typeof record.phase === 'string' ? record.phase : null;
            const errorRaw = record.error;
            const error = typeof errorRaw === 'string'
                ? errorRaw
                : errorRaw instanceof Error
                    ? errorRaw.message
                    : undefined;
            entries.push({
                id: typeof record.id === 'string' ? record.id : String(record.id ?? '?'),
                ...(typeof record.module === 'string' ? { module: record.module } : {}),
                phase,
                ...(error !== undefined ? { error } : {}),
            });
        }
    }
    catch {
        return [];
    }
    return entries;
}
