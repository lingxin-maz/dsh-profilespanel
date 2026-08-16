/**
 * F4 event bus: a tiny pub/sub with a monotonic sequence number shared by
 * the SSE stream and the long-poll fallback. Pure in-memory, no timers of
 * its own — waiters are woken by the next publish or by the caller's timeout.
 */
import type { ProfileChanges } from './profile.ts';
export type PanelEventType = 'pending' | 'clean' | 'installing' | 'installed' | 'restarting' | 'updates';
export interface PanelEvent {
    type: PanelEventType;
    seq: number;
    profile?: string;
    changes?: ProfileChanges | null;
    package?: string;
    overallOk?: boolean;
}
export interface PanelEventBus {
    /** Publish one event; every subscriber and waiter is notified. */
    publish(event: Omit<PanelEvent, 'seq'>): void;
    /** Subscribe; returns an unsubscribe function. */
    subscribe(listener: (event: PanelEvent) => void): () => void;
    /** The sequence number of the newest published event. */
    lastSeq(): number;
    /** Resolve immediately when a newer event exists, else on the next publish. */
    waitForNewer(since: number): Promise<void>;
}
export declare function createPanelEventBus(): PanelEventBus;
/** Wait with a timeout on top of the bus waiter (long-poll semantics). */
export declare function waitForNewerOrTimeout(bus: PanelEventBus, since: number, timeoutMs: number): Promise<void>;
//# sourceMappingURL=events.d.ts.map