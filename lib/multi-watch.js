/**
 * F5 multi-profile change aggregation: one change watcher per webCapable
 * profile (capped), funneled into a single pending-state list so the panel
 * can show "another profile needs a restart" even when the current profile
 * is clean. Reuses the single-profile watcher factory verbatim.
 */
import { snapshotProfile } from './profile.js';
import { createProfileWatcher } from './watcher.js';
export function createMultiProfileWatcher(options) {
    const targets = options.profiles.slice(0, options.maxProfiles ?? 10);
    const states = new Map();
    const watchers = [];
    const emit = () => {
        options.onChange(targets
            .map((profile) => {
            const state = states.get(profile.name);
            return {
                profile: profile.name,
                pendingRestart: state?.pendingRestart ?? false,
                changes: state?.changes ?? null,
            };
        })
            .filter(state => state.pendingRestart));
    };
    for (const profile of targets) {
        states.set(profile.name, { pendingRestart: false, changes: null });
        try {
            const boot = snapshotProfile({ name: profile.name, dir: profile.dir, desktop: false });
            const watcher = createProfileWatcher({
                profileDir: profile.dir,
                boot,
                pollIntervalMs: options.pollIntervalMs,
                debounceMs: options.debounceMs,
                onPending: (changes) => {
                    states.set(profile.name, { pendingRestart: true, changes });
                    emit();
                },
                onClean: () => {
                    states.set(profile.name, { pendingRestart: false, changes: null });
                    emit();
                },
            });
            watchers.push(watcher);
        }
        catch { /* unreadable manifest — the profile simply never reports */ }
    }
    return {
        dispose() {
            for (const watcher of watchers)
                watcher.dispose();
            watchers.length = 0;
        },
        checkNow() {
            for (const watcher of watchers)
                watcher.checkNow();
        },
    };
}
