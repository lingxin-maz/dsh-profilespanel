/**
 * Profile change detection: fs.watch on the tracked files plus a slow poll
 * as the reliable fallback (Windows fs.watch is unreliable), both funneled
 * through one debounced check against the boot snapshot.
 */
import { type BootSnapshot, type ProfileChanges } from './profile.ts';
export interface WatcherOptions {
    profileDir: string;
    boot: BootSnapshot;
    pollIntervalMs: number;
    debounceMs: number;
    onPending: (changes: ProfileChanges) => void;
    onClean: () => void;
}
export interface ProfileWatcher {
    /** Stop watching and polling; idempotent. */
    dispose(): void;
    /** Force an immediate check (e.g. after a sync-install run completes). */
    checkNow(): void;
}
/** True when two change reports describe the same pending state. */
export declare function sameChanges(left: ProfileChanges | null, right: ProfileChanges | null): boolean;
/**
 * Watch a profile directory for post-boot mutations. fs.watch events trigger
 * a fast debounced check; a poll timer (pollIntervalMs) re-checks on the slow
 * path so missed events on Windows still surface within the interval. The
 * callbacks only fire when the reported change set actually changes.
 */
export declare function createProfileWatcher(options: WatcherOptions): ProfileWatcher;
//# sourceMappingURL=watcher.d.ts.map