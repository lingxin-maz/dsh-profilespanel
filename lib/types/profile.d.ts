/**
 * Profile location, boot snapshot, and disk-state comparison — everything the
 * panel learns from the profile directory (manifest, bundle list, tracked
 * file stats). Pure functions of explicit inputs wherever possible so the
 * decision logic stays unit-testable without touching the real host.
 */
/** Profile identity fixed for one host generation (desktop service shape). */
export interface DesktopCurrentProfile {
    readonly name: string;
    readonly dir: string;
}
/** One discovered profile as offered to the sync-install section. */
export interface ProfileSummary {
    name: string;
    dir: string;
    /** Whether the profile can back a Web surface (desktop verdict when available). */
    webCapable: boolean;
    /** Non-empty when the launcher refuses this profile for desktop use. */
    problem?: string;
}
/** Profile identity + location resolved at boot. */
export interface ResolvedProfile {
    name: string;
    dir: string;
    /** True when the identity came from the desktop launcher service. */
    desktop: boolean;
}
export declare function dshHome(): string;
/** Resolve a profile name to its directory under DSH_HOME (default ~/.dsh). */
export declare function profileDir(profile: string): string;
/** The profile this host process actually booted (`--profile <name>` on argv). */
export declare function argvProfile(argv?: string[]): string | undefined;
/**
 * Resolve the panel's target profile. Priority (high to low):
 * 1. `ctx.desktopProfiles.current` (desktop launcher) — fixing dshmarket's
 *    defect of defaulting a desktop host to `web`;
 * 2. `--profile <name>` on the CLI invocation;
 * 3. an explicit configuration override;
 * 4. `web`.
 *
 * The configuration override is checked before the argv fallback so operators
 * can pin a profile even on hosts whose argv is managed by a supervisor.
 */
export declare function resolveProfile(options: {
    configured?: string;
    argv?: string[];
    desktop?: DesktopCurrentProfile | undefined;
}): ResolvedProfile;
/** Validate a profile name before it touches the filesystem. */
export declare function validProfileName(name: string): boolean;
export interface ProfileManifest {
    name?: string;
    private?: boolean;
    dependencies?: Record<string, string>;
    dsh?: {
        profile?: {
            bundles?: string[];
        };
    };
}
/**
 * Read a profile manifest; throws a descriptive error when missing or broken
 * (the panel surfaces it instead of crashing the host).
 */
export declare function readProfileManifest(dir: string): ProfileManifest;
/** Read a manifest or return null (unreadable profiles degrade, never throw). */
export declare function tryReadProfileManifest(dir: string): ProfileManifest | null;
/** Write a profile manifest back (2-space JSON, trailing newline). */
export declare function writeProfileManifest(dir: string, manifest: ProfileManifest): void;
/** Order-sensitive bundle layer list of a manifest. */
export declare function manifestBundles(manifest: ProfileManifest): string[];
/** Dependency map of a manifest. */
export declare function manifestDeps(manifest: ProfileManifest): Record<string, string>;
/** Boot-frozen facts the change detector compares the disk against. */
export interface BootSnapshot {
    profileName: string;
    profileDir: string;
    bundles: string[];
    dependencies: Record<string, string>;
    /** mtimeMs+size of each tracked file at boot (missing files are absent). */
    files: Map<string, FileStamp>;
}
export interface FileStamp {
    mtimeMs: number;
    size: number;
}
/** Files whose mutation signals "installed something since boot". */
export declare const TRACKED_FILES: readonly ['package.json', 'pnpm-lock.yaml', 'node_modules/.modules.yaml'];
/** Stat one tracked file (relative to the profile dir), or null when absent. */
export declare function statTrackedFile(dir: string, relative: string): FileStamp | null;
/** Capture the boot snapshot of a profile directory. */
export declare function snapshotProfile(profile: ResolvedProfile): BootSnapshot;
/** What changed between the boot snapshot and the disk right now. */
export interface ProfileChanges {
    changedFiles: string[];
    addedBundles: string[];
    removedBundles: string[];
}
export interface DiskState {
    bundles: string[];
    dependencies: Record<string, string>;
    files: Map<string, FileStamp>;
}
/** Read the current disk state of a profile directory. */
export declare function readDiskState(dir: string): DiskState;
/**
 * Compare a disk state against the boot snapshot. Returns the change report
 * when a restart is required, null when the profile matches the boot.
 *
 * Triggers: bundle list or dependency map changed, or the lockfile /
 * `.modules.yaml` moved (a dependency update under the same range). A
 * package.json rewrite without semantic change is cosmetic and ignored.
 */
export declare function computeChanges(boot: BootSnapshot, disk: DiskState): ProfileChanges | null;
/** Every profile directory under $DSH_HOME/profiles (minus node_modules). */
export declare function discoverProfiles(home?: string): ProfileSummary[];
/** Launcher-compatible web-capability verdict from a manifest's bundle order. */
export declare function webCapableFromBundles(bundles: string[]): boolean;
/** The installed version of a package inside a profile, or null. */
export declare function readInstalledVersion(dir: string, name: string): string | null;
/** Whether a package physically present in the profile declares dsh.bundle. */
export declare function declaresBundlePatch(dir: string, name: string): boolean;
/** True when the profile directory exists at all. */
export declare function profileExists(dir: string): boolean;
//# sourceMappingURL=profile.d.ts.map