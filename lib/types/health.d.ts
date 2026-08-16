/**
 * F6 profile health check: static scans over the profile manifest and the
 * installed packages — broken manifests, missing packages, unsatisfied
 * peers, orphaned bundle entries, duplicate layer entries — plus a dry-run
 * reconcile preview of the next boot's bundle stack. Never writes.
 */
export interface HealthIssue {
    severity: 'error' | 'warning' | 'info';
    code: 'manifest-broken' | 'missing-package' | 'peer-gap' | 'orphan-bundle' | 'duplicate-bundle';
    bundle?: string;
    message: string;
}
export interface HealthPayload {
    profile: string;
    ok: boolean;
    nextBundles: string[];
    issues: HealthIssue[];
}
/** Whether a package's own package.json exists under the profile. */
export declare function packageInstalled(profileDir: string, name: string): boolean;
/** Resolve a package's own manifest from the profile or the shared home. */
export declare function readPackageManifest(profileDir: string, name: string): Record<string, unknown> | null;
/** Best-effort semver range satisfaction (covers the common shapes only). */
export declare function satisfiesRange(installed: string | null, range: string): boolean;
/**
 * Collect the health payload for one profile. Every scan failure degrades to
 * a report entry — this function never throws.
 */
export declare function collectHealth(profileDir: string, profileName: string): HealthPayload;
//# sourceMappingURL=health.d.ts.map