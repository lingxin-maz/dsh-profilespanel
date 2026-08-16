/**
 * F4 event bus: a tiny pub/sub with a monotonic sequence number shared by
 * the SSE stream and the long-poll fallback. Pure in-memory, no timers of
 * its own — waiters are woken by the next publish or by the caller's timeout.
 */
export function createPanelEventBus() {
    let seq = 0;
    const listeners = new Set();
    const waiters = new Set();
    return {
        publish(event) {
            seq += 1;
            const full = { ...event, seq };
            for (const listener of [...listeners]) {
                try {
                    listener(full);
                }
                catch { /* a broken subscriber never breaks the bus */ }
            }
            const pending = [...waiters];
            waiters.clear();
            for (const wake of pending)
                wake();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        lastSeq() {
            return seq;
        },
        waitForNewer(since) {
            if (seq > since)
                return Promise.resolve();
            return new Promise((resolve) => {
                waiters.add(() => resolve());
            });
        },
    };
}
/** Wait with a timeout on top of the bus waiter (long-poll semantics). */
export async function waitForNewerOrTimeout(bus, since, timeoutMs) {
    if (bus.lastSeq() > since)
        return;
    let timer;
    try {
        await Promise.race([
            bus.waitForNewer(since),
            new Promise((resolve) => {
                timer = setTimeout(resolve, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
