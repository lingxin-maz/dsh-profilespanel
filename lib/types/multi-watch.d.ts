/**
 * F5 multi-profile change aggregation: one change watcher per webCapable
 * profile (capped), funneled into a single pending-state list so the panel
 * can show "another profile needs a restart" even when the current profile
 * is clean. Reuses the single-profile watcher factory verbatim.
 */
import { type ProfileChanges, type ProfileSummary } from './profile.ts';
export interface ProfilePendingState {
    profile: string;
    pendingRestart: boolean;
    changes: ProfileChanges | null;
}
export interface MultiWatchOptions {
    profiles: ProfileSummary[];
    pollIntervalMs: number;
    debounceMs: number;
    /** Cap on concurrently watched profiles (defensive; default 10). */
    maxProfiles?: number;
    /** Called with the pending-only list whenever any profile changes. */
    onChange: (states: ProfilePendingState[]) => void;
}
export interface MultiProfileWatcher {
    dispose(): void;
    checkNow(): void;
}
export declare function createMultiProfileWatcher(options: MultiWatchOptions): MultiProfileWatcher;
//# sourceMappingURL=multi-watch.d.ts.map