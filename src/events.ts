/**
 * F4 event bus: a tiny pub/sub with a monotonic sequence number shared by
 * the SSE stream and the long-poll fallback. Pure in-memory, no timers of
 * its own — waiters are woken by the next publish or by the caller's timeout.
 */

import type { ProfileChanges } from './profile.ts'

export type PanelEventType =
  | 'pending'
  | 'clean'
  | 'installing'
  | 'installed'
  | 'restarting'
  | 'updates'

export interface PanelEvent {
  type: PanelEventType
  seq: number
  profile?: string
  changes?: ProfileChanges | null
  package?: string
  overallOk?: boolean
}

export interface PanelEventBus {
  /** Publish one event; every subscriber and waiter is notified. */
  publish(event: Omit<PanelEvent, 'seq'>): void
  /** Subscribe; returns an unsubscribe function. */
  subscribe(listener: (event: PanelEvent) => void): () => void
  /** The sequence number of the newest published event. */
  lastSeq(): number
  /** Resolve immediately when a newer event exists, else on the next publish. */
  waitForNewer(since: number): Promise<void>
}

export function createPanelEventBus(): PanelEventBus {
  let seq = 0
  const listeners = new Set<(event: PanelEvent) => void>()
  const waiters = new Set<() => void>()
  return {
    publish(event) {
      seq += 1
      const full: PanelEvent = { ...event, seq }
      for (const listener of [...listeners]) {
        try {
          listener(full)
        } catch { /* a broken subscriber never breaks the bus */ }
      }
      const pending = [...waiters]
      waiters.clear()
      for (const wake of pending) wake()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    lastSeq() {
      return seq
    },
    waitForNewer(since) {
      if (seq > since) return Promise.resolve()
      return new Promise((resolve) => {
        waiters.add(() => resolve())
      })
    },
  }
}

/** Wait with a timeout on top of the bus waiter (long-poll semantics). */
export async function waitForNewerOrTimeout(bus: PanelEventBus, since: number, timeoutMs: number): Promise<void> {
  if (bus.lastSeq() > since) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      bus.waitForNewer(since),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
