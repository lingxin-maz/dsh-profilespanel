/**
 * Desktop-end presence detection and install-target resolution (F16).
 * Shared with F14 (desktop profile-selection readout) later in the same
 * module — both features reason about the desktop GUI's existence.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dshHome, manifestBundles, tryReadProfileManifest, webCapableFromBundles, } from './profile.js';
/** Desktop app data directory for the current platform. */
export function desktopAppDataDir(platform = process.platform, env = process.env, home = homedir()) {
    if (platform === 'win32') {
        return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'DSH Desktop');
    }
    if (platform === 'darwin') {
        return join(home, 'Library', 'Application Support', 'DSH Desktop');
    }
    return join(home, '.config', 'DSH Desktop');
}
/**
 * Detect whether a desktop GUI end exists. Priority (high to low):
 * 1. `runtime`   — the desktopProfiles service exists (we run inside DSH Desktop);
 * 2. `profile`   — $DSH_HOME/profiles/desktop exists and is webCapable;
 * 3. `app-data`  — the desktop app's data directory exists;
 * 4. `none`.
 * Every failure degrades to `none` — detection never blocks.
 */
export function detectDesktop(options) {
    const { hasDesktopProfilesService, currentDesktopName } = options;
    const home = options.dshHomePath ?? dshHome();
    const platform = options.platform ?? process.platform;
    const env = options.env ?? process.env;
    if (hasDesktopProfilesService) {
        const presence = { detected: true, reason: 'runtime' };
        // Inside the desktop app, the desktop end is the app's active profile;
        // dual pairing resolves the other end against the current name instead.
        if (currentDesktopName !== undefined)
            presence.desktopProfile = currentDesktopName;
        return presence;
    }
    const desktopDir = join(home, 'profiles', 'desktop');
    const manifest = tryReadProfileManifest(desktopDir);
    if (manifest !== null && webCapableFromBundles(manifestBundles(manifest))) {
        return { detected: true, reason: 'profile', desktopProfile: 'desktop' };
    }
    const appDir = desktopAppDataDir(platform, env);
    if (existsSync(appDir)) {
        return { detected: true, reason: 'app-data', appDataDir: appDir };
    }
    return { detected: false, reason: 'none' };
}
/**
 * The other end of a dual install: `web` pairs with the desktop end,
 * `desktop` pairs with `web`, and a custom profile pairs with the desktop
 * end (which defaults to the conventional `desktop` name).
 */
export function dualOtherEnd(currentName, presence) {
    if (currentName === 'web')
        return presence.desktopProfile ?? 'desktop';
    if (currentName === 'desktop')
        return 'web';
    return presence.desktopProfile ?? 'desktop';
}
/**
 * Resolve install target profiles (F16). Priority: explicit `profiles` >
 * `mode` > default `single` (current profile only). A `dual` request with
 * no usable other end degrades to the current profile plus a warning —
 * never a 400, so the install stays idempotent and forgiving.
 */
export function resolveInstallTargets(options) {
    const { requested, mode, currentName, presence, available } = options;
    if (requested !== undefined && requested.length > 0) {
        return { profiles: [...requested], warnings: [] };
    }
    const names = available.map(profile => profile.name);
    if (mode === 'dual') {
        if (!presence.detected) {
            return {
                profiles: [currentName],
                warnings: [{ code: 'dual-unavailable', message: 'no desktop GUI detected — installing into the current profile only' }],
            };
        }
        const other = dualOtherEnd(currentName, presence);
        if (!names.includes(other)) {
            return {
                profiles: [currentName],
                warnings: [{ code: 'dual-unavailable', message: `desktop end profile unavailable (${other}) — installing into the current profile only` }],
            };
        }
        return { profiles: [currentName, other], warnings: [] };
    }
    if (mode === 'all') {
        return { profiles: [...names], warnings: [] };
    }
    return { profiles: [currentName], warnings: [] };
}
/**
 * Read the desktop app's `profile-selection/state.json` (active profile +
 * lastKnownGood fallback). Returns null when unreadable or uninformative —
 * the panel simply hides the section then.
 */
export function readDesktopSelection(appDataDir) {
    try {
        const raw = readFileSync(join(appDataDir, 'profile-selection', 'state.json'), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        const record = parsed;
        const active = typeof record.active === 'string' ? record.active : undefined;
        const lastKnownGood = typeof record.lastKnownGood === 'string' ? record.lastKnownGood : undefined;
        if (active === undefined && lastKnownGood === undefined)
            return null;
        return {
            ...(active !== undefined ? { active } : {}),
            ...(lastKnownGood !== undefined ? { lastKnownGood } : {}),
        };
    }
    catch {
        return null;
    }
}
