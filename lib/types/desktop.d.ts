/**
 * Desktop-end presence detection and install-target resolution (F16).
 * Shared with F14 (desktop profile-selection readout) later in the same
 * module — both features reason about the desktop GUI's existence.
 */
import { type ProfileSummary } from './profile.ts';
export interface DesktopPresence {
    detected: boolean;
    reason: 'runtime' | 'profile' | 'app-data' | 'none';
    /** The desktop end's profile name when a webCapable desktop profile exists. */
    desktopProfile?: string;
    /** Desktop app data dir (reason='app-data'); abbreviated by the caller. */
    appDataDir?: string;
}
/** Desktop app data directory for the current platform. */
export declare function desktopAppDataDir(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, home?: string): string;
/**
 * Detect whether a desktop GUI end exists. Priority (high to low):
 * 1. `runtime`   — the desktopProfiles service exists (we run inside DSH Desktop);
 * 2. `profile`   — $DSH_HOME/profiles/desktop exists and is webCapable;
 * 3. `app-data`  — the desktop app's data directory exists;
 * 4. `none`.
 * Every failure degrades to `none` — detection never blocks.
 */
export declare function detectDesktop(options: {
    hasDesktopProfilesService: boolean;
    currentDesktopName?: string;
    dshHomePath?: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
}): DesktopPresence;
/**
 * The other end of a dual install: `web` pairs with the desktop end,
 * `desktop` pairs with `web`, and a custom profile pairs with the desktop
 * end (which defaults to the conventional `desktop` name).
 */
export declare function dualOtherEnd(currentName: string, presence: DesktopPresence): string;
export interface TargetResolutionWarning {
    code: 'dual-unavailable';
    message: string;
}
/**
 * Resolve install target profiles (F16). Priority: explicit `profiles` >
 * `mode` > default `single` (current profile only). A `dual` request with
 * no usable other end degrades to the current profile plus a warning —
 * never a 400, so the install stays idempotent and forgiving.
 */
export declare function resolveInstallTargets(options: {
    requested?: string[];
    mode?: 'single' | 'dual' | 'all';
    currentName: string;
    presence: DesktopPresence;
    available: ProfileSummary[];
}): {
    profiles: string[];
    warnings: TargetResolutionWarning[];
};
export interface DesktopSelection {
    active?: string;
    lastKnownGood?: string;
}
/**
 * Read the desktop app's `profile-selection/state.json` (active profile +
 * lastKnownGood fallback). Returns null when unreadable or uninformative —
 * the panel simply hides the section then.
 */
export declare function readDesktopSelection(appDataDir: string): DesktopSelection | null;
//# sourceMappingURL=desktop.d.ts.map