/**
 * Status hook (F4): SSE-first with a polling fallback. The event stream
 * delivers named panel events; any of them triggers a fresh /status read so
 * the UI always renders the authoritative snapshot. When EventSource is
 * missing (jsdom) or the stream keeps failing (≥2 errors), the hook falls
 * back to plain interval polling of /status.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchStatus, type PanelStatus } from './status-data.ts'

export interface StatusView {
  status: PanelStatus | null
  error: boolean
  refresh: () => void
}

const SSE_EVENT_TYPES = ['pending', 'clean', 'installing', 'installed', 'restarting', 'updates'] as const

export function usePanelStatus(intervalMs = 2000): StatusView {
  const [status, setStatus] = useState<PanelStatus | null>(null)
  const [error, setError] = useState(false)
  const tick = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const mine = ++tick.current
    try {
      const next = await fetchStatus()
      if (mine === tick.current) {
        setStatus(next)
        setError(false)
      }
    } catch {
      if (mine === tick.current) setError(true)
    }
  }, [])

  useEffect(() => {
    void load()
    let source: EventSource | null = null
    let streamErrors = 0
    let poll: ReturnType<typeof setInterval> | undefined

    const startPolling = (): void => {
      if (poll !== undefined) return
      poll = setInterval(() => {
        void load()
      }, intervalMs)
    }

    if (typeof EventSource === 'undefined') {
      startPolling()
    } else {
      try {
        source = new EventSource('/api/profile-panel/events')
        const refresh = (): void => {
          void load()
        }
        source.onmessage = refresh
        for (const type of SSE_EVENT_TYPES) source.addEventListener(type, refresh)
        source.onerror = () => {
          streamErrors += 1
          if (streamErrors >= 2 && source !== null) {
            source.close()
            source = null
            startPolling()
          }
        }
      } catch {
        startPolling()
      }
    }

    return () => {
      tick.current += 1
      source?.close()
      if (poll !== undefined) clearInterval(poll)
    }
  }, [load, intervalMs])

  return { status, error, refresh: () => void load() }
}
