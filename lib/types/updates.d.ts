/**
 * F3 update detection: which installed bundle dependencies are outdated
 * against the registry, plus the shared update/align execution (which reuses
 * the install executor, reconcile, and downgrade marking verbatim).
 */
import { type RegistryView } from './registry.ts';
import { installIntoProfiles, type PnpmExecutor } from './install.ts';
import type { Context } from '@deepseek-ai/cordis';
export interface UpdateRow {
    bundle: string;
    installed: string | null;
    latest: string | null;
    outdated: boolean;
    releaseAgeDays: number | null;
}
export interface UpdatesPayload {
    profile: string;
    updatedAt: string;
    updates: UpdateRow[];
    warnings?: Array<{
        code: string;
        message: string;
    }>;
}
/** F17: dependency specs the npm registry cannot answer for. */
export declare function isNonRegistrySpec(spec: string): boolean;
/** Installed dependency names that declare `dsh.bundle.patch` (the panel's bundle set). */
export declare function listBundleDependencies(profileDir: string): string[];
/**
 * Collect per-bundle update status for one profile. Registry failures
 * degrade to warnings (the feed never blocks on the network). F17:
 * GitHub/link/file deps are reported with their spec but never queried
 * against the npm registry (their names usually do not exist there).
 */
export declare function collectUpdates(options: {
    profileDir: string;
    profileName: string;
    registryView: (pkg: string) => Promise<RegistryView>;
}): Promise<UpdatesPayload>;
/**
 * F3 update: install a (usually newer) spec into the given profiles. Pure
 * reuse of the install executor — update is an install with a version.
 */
export declare function updateIntoProfiles(options: {
    request: {
        package: string;
        spec?: string;
        profiles?: string[];
    };
    ctx: Context;
    currentName: string;
    executor?: PnpmExecutor;
}): Promise<ReturnType<typeof installIntoProfiles>>;
/**
 * F3 align: bring one package to the same version across several profiles.
 * `version` defaults to the registry latest; a registry failure surfaces as
 * a typed error before anything is installed.
 */
export declare function alignAcrossProfiles(options: {
    request: {
        package: string;
        profiles: string[];
        version?: string;
    };
    ctx: Context;
    currentName: string;
    registryView: (pkg: string) => Promise<RegistryView>;
    executor?: PnpmExecutor;
}): Promise<ReturnType<typeof installIntoProfiles> | {
    error: string;
}>;
//# sourceMappingURL=updates.d.ts.map