/**
 * F5 multi-profile change aggregation: one change watcher per webCapable
 * profile (capped), funneled into a single pending-state list so the panel
 * can show "another profile needs a restart" even when the current profile
 * is clean. Reuses the single-profile watcher factory verbatim.
 */

import { snapshotProfile, type ProfileChanges, type ProfileSummary } from './profile.ts'
import { createProfileWatcher, type ProfileWatcher } from './watcher.ts'

export interface ProfilePendingState {
  profile: string
  pendingRestart: boolean
  changes: ProfileChanges | null
}

export interface MultiWatchOptions {
  profiles: ProfileSummary[]
  pollIntervalMs: number
  debounceMs: number
  /** Cap on concurrently watched profiles (defensive; default 10). */
  maxProfiles?: number
  /** Called with the pending-only list whenever any profile changes. */
  onChange: (states: ProfilePendingState[]) => void
}

export interface MultiProfileWatcher {
  dispose(): void
  checkNow(): void
}

export function createMultiProfileWatcher(options: MultiWatchOptions): MultiProfileWatcher {
  const targets = options.profiles.slice(0, options.maxProfiles ?? 10)
  const states = new Map<string, { pendingRestart: boolean; changes: ProfileChanges | null }>()
  const watchers: ProfileWatcher[] = []

  const emit = (): void => {
    options.onChange(targets
      .map((profile) => {
        const state = states.get(profile.name)
        return {
          profile: profile.name,
          pendingRestart: state?.pendingRestart ?? false,
          changes: state?.changes ?? null,
        }
      })
      .filter(state => state.pendingRestart))
  }

  for (const profile of targets) {
    states.set(profile.name, { pendingRestart: false, changes: null })
    try {
      const boot = snapshotProfile({ name: profile.name, dir: profile.dir, desktop: false })
      const watcher = createProfileWatcher({
        profileDir: profile.dir,
        boot,
        pollIntervalMs: options.pollIntervalMs,
        debounceMs: options.debounceMs,
        onPending: (changes) => {
          states.set(profile.name, { pendingRestart: true, changes })
          emit()
        },
        onClean: () => {
          states.set(profile.name, { pendingRestart: false, changes: null })
          emit()
        },
      })
      watchers.push(watcher)
    } catch { /* unreadable manifest — the profile simply never reports */ }
  }

  return {
    dispose() {
      for (const watcher of watchers) watcher.dispose()
      watchers.length = 0
    },
    checkNow() {
      for (const watcher of watchers) watcher.checkNow()
    },
  }
}
