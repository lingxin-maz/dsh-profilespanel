/**
 * Multi-profile sync install: validate a registry package spec, run pnpm add
 * in each target profile (desktop: packaged DesktopPnpm service; plain web:
 * system pnpm), then reconcile the profile's `dsh.profile.bundles` layer list
 * with the official `dsh plugin` semantics (a dependency that declares
 * `dsh.bundle.patch` joins the layer stack).
 */
import type { Context } from '@deepseek-ai/cordis';
import { type ProfileManifest, type ProfileSummary } from './profile.ts';
/** True when the string is a GitHub install target (validated elsewhere). */
export declare function isGithubTarget(target: string): boolean;
export interface InstallRequest {
    package: string;
    spec?: string;
    profiles?: string[];
}
export interface InstallRow {
    profile: string;
    ok: boolean;
    error?: string;
    requestedVersion?: string | null;
    resolvedVersion?: string | null;
    /** True when pnpm resolved an older version than the explicit request (release-age policy). */
    downgraded?: boolean;
    /** F17: dependency names a GitHub install added (empty for npm installs). */
    installedAs?: string[];
}
export interface InstallOutcome {
    overallOk: boolean;
    results: InstallRow[];
    /** Profiles restored from their pre-install snapshot after a partial failure (F2 rollback). */
    rolledBackProfiles?: string[];
}
/** A validated install target: registry package or GitHub repo selector. */
export interface ValidatedInstallTarget {
    target: string;
    package: string;
    kind: 'npm' | 'github';
    /** GitHub repo (`owner/repo`) when kind is github. */
    repo?: string;
    /** Monorepo subpath selector, when the github target carries one. */
    subpath?: string | null;
}
/**
 * Validate an install request body. Returns the canonical target argument
 * plus the bare package name, or an error string.
 *
 * F17: besides plain registry packages, `github:owner/repo[#path:/sub]`
 * targets are accepted (the panel's market integration installs GitHub-only
 * plugins with them). Local paths, git URLs, http URLs, and anything with
 * shell metacharacters are rejected.
 */
export declare function validateInstallTarget(packageName: unknown, spec: unknown): ValidatedInstallTarget | {
    error: string;
};
/** Outcome of one pnpm add run. */
export interface PnpmRun {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    /** True when the package manager itself was missing. */
    missing?: boolean;
}
export interface PnpmExecutor {
    /** Run `pnpm add <target>` against one profile directory. */
    add(target: string, profileDir: string): Promise<PnpmRun>;
}
/** Run system pnpm (pure-web fallback), cwd = profile dir. */
export declare function runSystemPnpm(target: string, profileDir: string): Promise<PnpmRun>;
/** DesktopPnpm service surface (structural: provided by dsh-plugin-desktop). */
export interface DesktopPnpmService {
    run(args: string[], signal?: AbortSignal): {
        stdout: NodeJS.ReadableStream;
        stderr: NodeJS.ReadableStream;
        done: Promise<{
            exitCode: number | null;
            signal: string | null;
        }>;
        cancel(): void;
    };
}
/** Run the desktop app's packaged pnpm against one profile directory. */
export declare function runDesktopPnpm(service: DesktopPnpmService, target: string, profileDir: string): Promise<PnpmRun>;
/** Resolve the executor for this host: packaged pnpm on desktop, system pnpm otherwise. */
export declare function resolveExecutor(ctx: Context): PnpmExecutor;
/**
 * Pure reconciliation computation (F6 dry-run shares this): returns the
 * resulting bundle list and whether it differs from the on-disk manifest.
 * Never writes.
 */
export declare function computeReconciledBundles(before: ProfileManifest, profileDir: string): {
    bundles: string[];
    changed: boolean;
};
/**
 * Reconcile `dsh.profile.bundles` against the installed state (official
 * `dsh plugin` semantics, mirrored locally): a dependency resolving to a
 * package that declares `dsh.bundle.patch` joins the layer stack (appended in
 * dependency order); a dependency-listed bundle that no longer declares it
 * leaves the stack. In-box bundles are not dependencies and are never
 * touched.
 * @returns the resulting bundle list.
 */
export declare function reconcileBundles(before: ProfileManifest, profileDir: string): string[];
/**
 * Whether an exact version pin resolved to an older release — the
 * supply-chain `minimumReleaseAge` degradation signal (P3). Ranges and
 * dist-tags are skipped: pnpm's own resolution is the contract there.
 */
export declare function isExactSpec(spec: string | undefined | null): boolean;
/** Compare two plain semver strings: -1 / 0 / 1. */
export declare function semverCompare(left: string, right: string): number;
/** Profiles eligible for a sync install (current profile always first). */
export declare function listInstallableProfiles(ctx: Context, currentName: string): {
    profiles: ProfileSummary[];
    desktop: boolean;
};
/**
 * Install one registry target into each requested profile, serially (avoids
 * same-store lock contention), reconciling bundles after each success.
 * Partial failure is reported per profile — no silent success, no auto
 * rollback (v1). With `rollback: true` (F2), a partial failure restores
 * every succeeded profile to its pre-install manifest and reports it in
 * `rolledBackProfiles`. The executor is injectable for tests.
 */
export declare function installIntoProfiles(options: {
    request: InstallRequest;
    ctx: Context;
    currentName: string;
    executor?: PnpmExecutor;
    rollback?: boolean;
}): Promise<InstallOutcome>;
/** Read the dependency spec pnpm wrote for a package, for diagnostics. */
export declare function readDependencySpec(dir: string, name: string): string | undefined;
/** Snapshot store location inside a profile directory (not a tracked file). */
export declare const UNDO_STORE = ".dsh-profile-panel";
export interface UndoSnapshotInfo {
    ts: string;
    dir: string;
    manifest: ProfileManifest;
}
/**
 * Save the current profile manifest (plus a lockfile fingerprint) under
 * `<profileDir>/.dsh-profile-panel/undo/<ts>/`. Always-on before any
 * install/update/align mutation so `undo` has a restore point; failures
 * return null and never block the mutation itself.
 */
export declare function saveUndoSnapshot(profileDir: string, now?: Date): UndoSnapshotInfo | null;
/** Every saved undo snapshot for a profile, newest first. */
export declare function findUndoSnapshots(profileDir: string): UndoSnapshotInfo[];
export interface UndoResult {
    profile: string;
    ok: boolean;
    restoredTs?: string;
    error?: string;
    hint?: string;
}
/**
 * Restore the newest snapshot manifest for one profile. Node modules are
 * not rebuilt — the hint tells the operator to run `pnpm install`.
 */
export declare function undoProfile(profileDir: string, name: string): UndoResult;
//# sourceMappingURL=install.d.ts.map