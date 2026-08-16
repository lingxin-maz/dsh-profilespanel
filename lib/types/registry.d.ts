/**
 * Registry metadata queries (F1): `pnpm view` wrappers with a TTL cache and
 * an injectable runner so unit tests never touch the network or spawn pnpm.
 * The version/timing helpers used by the install-preview assistant and the
 * F3 updates feed share this module.
 */
/** Outcome of one `pnpm view` invocation (structural, injectable). */
export interface PnpmViewRun {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    /** True when the pnpm binary itself was missing. */
    missing?: boolean;
}
export type PnpmViewRunner = (args: string[]) => Promise<PnpmViewRun>;
export interface RegistryViewOk {
    ok: true;
    package: string;
    /** Latest dist-tag version, or null when the registry gave no answer. */
    latest: string | null;
    /** Publish time of `latest` (falls back to created/modified). */
    publishedAt: string | null;
    /** Raw `pnpm view <pkg> time --json` map. */
    timeMap: Record<string, string>;
}
export interface RegistryViewFail {
    ok: false;
    package: string;
    code: 'network' | 'not-found';
    message: string;
}
export type RegistryView = RegistryViewOk | RegistryViewFail;
/** Run `pnpm view <args>` against the system pnpm (pure-web fallback). */
export declare function runPnpmView(args: string[]): Promise<PnpmViewRun>;
/**
 * Query registry metadata for one package: dist-tag `latest` plus the
 * publish-time table. Failure degrades to a typed failure — never throws.
 */
export declare function queryRegistry(packageName: string, runner?: PnpmViewRunner): Promise<RegistryView>;
/** Whole days (floor) between a published timestamp and now; null when unknown. */
export declare function releaseAgeDays(publishedAt: string | null, now?: number): number | null;
export interface PreviewWarning {
    code: 'release-age' | 'network' | 'not-found' | 'github-source';
    message: string;
}
export interface InstallPreview {
    ok: boolean;
    package: string;
    spec: string | null;
    /** 'npm' when the preview came from the registry, 'github' for repo targets. */
    source: 'npm' | 'github';
    latest: string | null;
    publishedAt: string | null;
    releaseAgeDays: number | null;
    minimumReleaseAgeDays: number;
    warnings: PreviewWarning[];
    suggestedPin: string | null;
}
/** F17: preview for a GitHub install target — no registry version exists. */
export declare function buildGithubPreview(packageName: string, minimumReleaseAgeDays: number): InstallPreview;
/**
 * Build the install-preview payload from a registry view (F1). A registry
 * failure becomes a warning inside a 200-shaped payload — the assistant
 * never blocks an install on the network.
 */
export declare function buildInstallPreview(options: {
    view: RegistryView;
    packageName: string;
    spec?: string | null;
    minimumReleaseAgeDays: number;
    now?: number;
}): InstallPreview;
/** TTL-cached registry viewer factory (shared by F1 preview and F3 updates). */
export declare function createRegistryCache(viewer: (pkg: string) => Promise<RegistryView>, ttlMs?: number): (pkg: string) => Promise<RegistryView>;
//# sourceMappingURL=registry.d.ts.map