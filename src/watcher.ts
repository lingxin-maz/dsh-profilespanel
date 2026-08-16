/**
 * Profile change detection: fs.watch on the tracked files plus a slow poll
 * as the reliable fallback (Windows fs.watch is unreliable), both funneled
 * through one debounced check against the boot snapshot.
 */

import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import {
  TRACKED_FILES,
  computeChanges,
  readDiskState,
  type BootSnapshot,
  type ProfileChanges,
} from './profile.ts'

export interface WatcherOptions {
  profileDir: string
  boot: BootSnapshot
  pollIntervalMs: number
  debounceMs: number
  onPending: (changes: ProfileChanges) => void
  onClean: () => void
}

export interface ProfileWatcher {
  /** Stop watching and polling; idempotent. */
  dispose(): void
  /** Force an immediate check (e.g. after a sync-install run completes). */
  checkNow(): void
}

/** True when two change reports describe the same pending state. */
export function sameChanges(left: ProfileChanges | null, right: ProfileChanges | null): boolean {
  if (left === null || right === null) return left === right
  const eq = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index])
  return eq(left.changedFiles, right.changedFiles)
    && eq(left.addedBundles, right.addedBundles)
    && eq(left.removedBundles, right.removedBundles)
}

/**
 * Watch a profile directory for post-boot mutations. fs.watch events trigger
 * a fast debounced check; a poll timer (pollIntervalMs) re-checks on the slow
 * path so missed events on Windows still surface within the interval. The
 * callbacks only fire when the reported change set actually changes.
 */
export function createProfileWatcher(options: WatcherOptions): ProfileWatcher {
  let disposed = false
  let debounce: ReturnType<typeof setTimeout> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let watchers: FSWatcher[] = []
  let lastReported: ProfileChanges | null = null

  const check = (): void => {
    if (disposed) return
    let changes: ProfileChanges | null = null
    try {
      changes = computeChanges(options.boot, readDiskState(options.profileDir))
    } catch {
      // Unreadable manifest — keep the previous verdict; the next poll retries.
      return
    }
    if (sameChanges(changes, lastReported)) return
    lastReported = changes
    if (changes === null) options.onClean()
    else options.onPending(changes)
  }

  const scheduleCheck = (delayMs: number): void => {
    if (disposed) return
    if (debounce !== undefined) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = undefined
      check()
    }, delayMs)
  }

  // Watch each tracked file where possible; failures (missing dirs etc.)
  // degrade silently to the poll path.
  for (const file of TRACKED_FILES) {
    try {
      const watcher = watch(join(options.profileDir, file), () => scheduleCheck(options.debounceMs))
      watcher.on('error', () => watcher.close())
      watchers.push(watcher)
    } catch { /* fall back to polling */ }
  }

  poll = setInterval(check, options.pollIntervalMs)
  // Initial read so the baseline matches disk right after boot.
  check()

  return {
    dispose() {
      if (disposed) return
      disposed = true
      if (debounce !== undefined) clearTimeout(debounce)
      if (poll !== undefined) clearInterval(poll)
      for (const watcher of watchers) watcher.close()
      watchers = []
    },
    checkNow() {
      scheduleCheck(0)
    },
  }
}
