/**
 * F9 boot report: a read of the official loader projection
 * (`ctx.loader.entries()`, same shape dsh-host-plugin-inventory exposes) —
 * which bundle layers activated and which failed. Read-only, live.
 */
export interface BootReportEntry {
    id: string;
    module?: string;
    phase: string | null;
    error?: string;
}
export interface BootReportPayload {
    bootedAt: string;
    entries: BootReportEntry[];
}
export interface LoaderService {
    entries(): Iterable<unknown>;
}
/**
 * Project loader entries into the report shape; never throws. The cordis
 * loader's `entries()` is a GENERATOR (iterable, not an array), and entry
 * shapes may drift across harness versions — every stage degrades to an
 * empty report instead of failing the route.
 */
export declare function readLoaderEntries(loader: LoaderService | undefined): BootReportEntry[];
//# sourceMappingURL=boot-report.d.ts.map