import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import { buildStatus, mountPanelRoutes, type PanelHost, type PanelState } from '../../src/routes.ts'
import { saveUndoSnapshot } from '../../src/install.ts'
import { createPanelEventBus } from '../../src/events.ts'
import { appendAudit } from '../../src/audit.ts'
import { readProfileManifest, writeProfileManifest } from '../../src/profile.ts'
import type { BootSnapshot } from '../../src/profile.ts'

/* ------------------------------------------------------------------ */
/* HTTP fakes                                                          */
/* ------------------------------------------------------------------ */

interface FakeResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
  stream: string
  closeListeners: Array<() => void>
}

function makeResponse(): ServerResponse {
  const fake: FakeResponse & {
    writeHead(status: number, headers?: Record<string, string>): void
    end(chunk?: string): void
    write(chunk: string): boolean
    flushHeaders(): void
    on(event: string, listener: () => void): void
  } = {
    statusCode: 0,
    headers: {},
    body: '',
    stream: '',
    closeListeners: [],
    writeHead(status, headers) {
      fake.statusCode = status
      Object.assign(fake.headers, headers ?? {})
    },
    end(chunk) {
      fake.body = chunk ?? ''
    },
    write(chunk) {
      fake.stream += chunk
      return true
    },
    flushHeaders() { /* no-op */ },
    on(_event, listener) {
      fake.closeListeners.push(listener)
    },
  }
  return fake as unknown as ServerResponse
}

function makeRequest(overrides: Record<string, unknown> = {}, body?: string): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(body)]
  const closeListeners: Array<() => void> = []
  const request = {
    method: 'GET',
    headers: {} as Record<string, string>,
    socket: { remoteAddress: '127.0.0.1' },
    url: '/api/profile-panel/status',
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        next: async () => index < chunks.length
          ? { value: chunks[index++] as Buffer, done: false }
          : { value: undefined, done: true },
      }
    },
    on(event: string, listener: () => void) {
      if (event === 'close') closeListeners.push(listener)
      return request
    },
    emitClose() {
      for (const listener of [...closeListeners]) listener()
    },
    ...overrides,
  }
  return request as unknown as IncomingMessage
}

function trustedRequest(method: string, body?: string): IncomingMessage {
  return makeRequest({
    method,
    headers: { origin: 'http://127.0.0.1:5140', host: '127.0.0.1:5140' },
  }, body)
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

interface RouteEntry {
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

function makeHost(overrides: {
  ctx?: Context
  config?: Partial<PanelHost['config']>
  state?: Partial<PanelState>
  desktop?: PanelHost['desktop']
  registryView?: PanelHost['registryView']
  marketSearch?: PanelHost['marketSearch']
  events?: PanelHost['events']
  readBootReport?: PanelHost['readBootReport']
  hotReload?: PanelHost['hotReload']
} = {}): { host: PanelHost; routes: Map<string, RouteEntry> } {
  const routes = new Map<string, RouteEntry>()
  const webServer = {
    register(route: { kind: string; path: string; handler: RouteEntry['handler'] }) {
      routes.set(route.path, { path: route.path, handler: route.handler })
      return () => routes.delete(route.path)
    },
  }
  const boot = null
  const state: PanelState = {
    boot,
    pendingRestart: false,
    changes: null,
    restarting: false,
    installing: false,
    profilesPending: [],
    ...overrides.state,
  }
  const host: PanelHost = {
    ctx: overrides.ctx ?? makeCtx({}),
    webServer,
    config: {
      profile: { name: 'desktop', dir: 'C:\\fake\\desktop', desktop: true },
      allowRestart: true,
      minimumReleaseAgeDays: 7,
      ...overrides.config,
    },
    state,
    logger: { warn: vi.fn() },
    desktop: overrides.desktop ?? { detected: false, reason: 'none' },
    ...(overrides.registryView !== undefined ? { registryView: overrides.registryView } : {}),
    ...(overrides.marketSearch !== undefined ? { marketSearch: overrides.marketSearch } : {}),
    ...(overrides.events !== undefined ? { events: overrides.events } : {}),
    ...(overrides.readBootReport !== undefined ? { readBootReport: overrides.readBootReport } : {}),
    ...(overrides.hotReload !== undefined ? { hotReload: overrides.hotReload } : {}),
  }
  return { host, routes }
}

function makeCtx(services: Record<string, unknown>): Context {
  return {
    get: (name: string) => services[name],
  } as unknown as Context
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('GET /api/profile-panel/status', () => {
  it('returns method-not-allowed for POSTs to the status route', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/status')!.handler(makeRequest({ method: 'POST' }), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(405)
  })

  it('renders boot bundles as loaded and disk-only bundles as pending', () => {
    const boot: BootSnapshot = {
      profileName: 'desktop',
      profileDir: 'C:\\fake\\desktop',
      bundles: ['@deepseek-ai/dsh-base'],
      dependencies: {},
      files: new Map(),
    }
    const { host } = makeHost({ state: { boot } })
    const payload = buildStatus(host) as {
      bundles: Array<{ name: string; state: string }>
      pendingRestart: boolean
      restart: { available: boolean; hint: string }
    }
    expect(payload.bundles).toEqual([{ name: '@deepseek-ai/dsh-base', state: 'loaded' }])
    expect(payload.pendingRestart).toBe(false)
    expect(payload.restart.available).toBe(false)
    expect(payload.restart.hint).toContain('dsh web')
  })

  it('exposes restart availability when a desktop runtime exists', () => {
    const ctx = makeCtx({
      desktopRuntime: { requestRestart: vi.fn() },
      desktopProfiles: {
        current: { name: 'desktop' },
        list: () => [] as unknown[],
      },
    })
    const { host } = makeHost({ ctx })
    const payload = buildStatus(host) as { restart: { available: boolean; hint: string } }
    expect(payload.restart.available).toBe(true)
    expect(payload.restart.hint).toBe('')
  })
})

describe('POST /api/profile-panel/restart', () => {
  it('rejects cross-origin requests', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/restart')!.handler(
      makeRequest({
        method: 'POST',
        headers: { origin: 'https://evil.example', host: '127.0.0.1:5140' },
      }),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('rejects forwarded requests even on loopback', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/restart')!.handler(
      makeRequest({
        method: 'POST',
        headers: {
          origin: 'http://127.0.0.1:5140',
          host: '127.0.0.1:5140',
          'x-forwarded-for': '203.0.113.1',
        },
      }),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('honors allowRestart: false', async () => {
    const { host, routes } = makeHost({ config: { allowRestart: false } })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/restart')!.handler(trustedRequest('POST'), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('returns 501 with a CLI hint on hosts without a desktop runtime', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/restart')!.handler(trustedRequest('POST'), response)
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(501)
    expect(fake.body).toContain('hint')
  })

  it('schedules the desktop restart and answers 202 first', async () => {
    vi.useFakeTimers()
    try {
      const requestRestart = vi.fn()
      const ctx = makeCtx({ desktopRuntime: { requestRestart } })
      const { host, routes } = makeHost({ ctx })
      mountPanelRoutes(host)
      const response = makeResponse()
      await routes.get('/api/profile-panel/restart')!.handler(trustedRequest('POST'), response)
      const fake = response as unknown as FakeResponse
      expect(fake.statusCode).toBe(202)
      expect(host.state.restarting).toBe(true)
      expect(requestRestart).not.toHaveBeenCalled()
      vi.advanceTimersByTime(200)
      expect(requestRestart).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns 409 while a restart is already in progress', async () => {
    const ctx = makeCtx({ desktopRuntime: { requestRestart: vi.fn() } })
    const { host, routes } = makeHost({ ctx, state: { restarting: true } })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/restart')!.handler(trustedRequest('POST'), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(409)
  })
})

describe('POST /api/profile-panel/install', () => {
  it('rejects cross-origin requests', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install')!.handler(
      makeRequest({
        method: 'POST',
        headers: { origin: 'https://evil.example', host: '127.0.0.1:5140' },
      }, '{}'),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('rejects non-registry specs', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install')!.handler(
      trustedRequest('POST', JSON.stringify({ package: '../evil' })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(400)
    expect(fake.body).toContain('invalid package name')
  })

  it('rejects malformed profile lists', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'dshmarket', profiles: 'desktop' })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })

  it('returns 409 while another install is running', async () => {
    const { host, routes } = makeHost({ state: { installing: true } })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'dshmarket' })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(409)
  })

  it('rejects oversized bodies', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    const big = JSON.stringify({ package: 'dshmarket', spec: 'x'.repeat(5000) })
    await routes.get('/api/profile-panel/install')!.handler(trustedRequest('POST', big), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })
})

describe('POST /api/profile-panel/install-preview (F1)', () => {
  it('rejects cross-origin requests', async () => {
    const { host, routes } = makeHost({ registryView: async () => ({ ok: false, package: 'x', code: 'network', message: 'x' }) })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install-preview')!.handler(
      makeRequest({
        method: 'POST',
        headers: { origin: 'https://evil.example', host: '127.0.0.1:5140' },
      }, '{}'),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('rejects non-registry specs', async () => {
    const { host, routes } = makeHost({ registryView: async () => ({ ok: false, package: 'x', code: 'network', message: 'x' }) })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install-preview')!.handler(
      trustedRequest('POST', JSON.stringify({ package: '../evil' })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })

  it('returns 501 when the host has no registry viewer', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install-preview')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'dshmarket' })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(501)
    expect(fake.body).toContain('registry query unavailable')
  })

  it('builds the preview payload with a release-age warning', async () => {
    const registryView = async () => ({
      ok: true,
      package: 'dshmarket',
      latest: '1.5.1',
      publishedAt: new Date(Date.now() - 86_400_000).toISOString(), // 1 day old
      timeMap: {},
    }) as const
    const { host, routes } = makeHost({ registryView })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install-preview')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'dshmarket' })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { ok: boolean; warnings: Array<{ code: string }>; releaseAgeDays: number }
    expect(payload.ok).toBe(true)
    expect(payload.releaseAgeDays).toBe(1)
    expect(payload.warnings[0]?.code).toBe('release-age')
  })

  it('previews github targets without a registry viewer', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install-preview')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'github:owner/dsh-plugin-tts' })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { ok: boolean; source: string; latest: null; warnings: Array<{ code: string }> }
    expect(payload.ok).toBe(true)
    expect(payload.source).toBe('github')
    expect(payload.latest).toBeNull()
    expect(payload.warnings[0]?.code).toBe('github-source')
  })

  it('rejects github targets with a version spec', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install-preview')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'github:owner/repo', spec: '1.0.0' })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })
})

describe('GET /api/profile-panel/market/search (F17)', () => {
  it('returns 501 when the host has no market service', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/market/search')!.handler(
      makeRequest({ url: '/api/profile-panel/market/search?q=tts' }),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(501)
  })

  it('rejects non-GET methods', async () => {
    const { host, routes } = makeHost({ marketSearch: async () => ({ ok: true, source: 'live', updated: null, total: 0, query: '', results: [] }) })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/market/search')!.handler(
      makeRequest({ method: 'POST' }),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(405)
  })

  it('forwards the query and clamps the limit', async () => {
    const marketSearch = vi.fn(async (q: string) => ({
      ok: true,
      source: 'snapshot',
      updated: '2026-08-15',
      total: 1,
      query: q,
      results: [{ name: 'dsh-plugin-tts', installTarget: 'github:o/r', kind: 'github' }],
    }))
    const { host, routes } = makeHost({ marketSearch })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/market/search')!.handler(
      makeRequest({ url: '/api/profile-panel/market/search?q=tts&limit=999' }),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    expect(marketSearch).toHaveBeenCalledWith('tts', 20)
    const payload = JSON.parse(fake.body) as { ok: boolean; results: Array<{ name: string }> }
    expect(payload.ok).toBe(true)
    expect(payload.results[0]?.name).toBe('dsh-plugin-tts')
  })
})

describe('POST /api/profile-panel/undo (F2)', () => {
  it('rejects cross-origin requests', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/undo')!.handler(
      makeRequest({
        method: 'POST',
        headers: { origin: 'https://evil.example', host: '127.0.0.1:5140' },
      }, '{}'),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('returns 409 while an install is running', async () => {
    const { host, routes } = makeHost({ state: { installing: true } })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/undo')!.handler(trustedRequest('POST', '{}'), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(409)
  })

  it('reports unknown profiles instead of touching the filesystem', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/undo')!.handler(
      trustedRequest('POST', JSON.stringify({ profiles: ['ghost'] })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { ok: boolean; results: Array<{ profile: string; ok: boolean; error?: string }> }
    expect(payload.ok).toBe(false)
    expect(payload.results[0]?.profile).toBe('ghost')
    expect(payload.results[0]?.error).toContain('unknown or non-web profile')
  })

  it('restores the newest snapshot for a real profile', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `route-undo-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: { before: '1.0.0' } }))
    saveUndoSnapshot(dir)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: { before: '1.0.0', added: '2.0.0' } }))
    const ctx = makeCtx({
      desktopProfiles: {
        current: { name: 'x' },
        list: () => [{ name: 'x', dir, webCapable: true }],
      },
    })
    const { host, routes } = makeHost({ ctx })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/undo')!.handler(
      trustedRequest('POST', JSON.stringify({ profiles: ['x'] })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { ok: boolean; results: Array<{ profile: string; ok: boolean; hint?: string }> }
    expect(payload.ok).toBe(true)
    expect(payload.results[0]?.hint).toContain('pnpm install')
    const restored = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(restored.dependencies).toEqual({ before: '1.0.0' })
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('POST /api/profile-panel/install mode validation (F16)', () => {
  it('rejects an unknown mode value', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/install')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'dshmarket', mode: 'triple' })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(400)
    expect(fake.body).toContain('mode must be single, dual, or all')
  })
})

describe('GET /api/profile-panel/updates (F3)', () => {
  it('returns 501 when the host has no registry viewer', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/updates')!.handler(makeRequest({ method: 'GET' }), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(501)
  })

  it('collects per-bundle update rows for a real profile', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `route-updates-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(dir, 'node_modules', 'bundled'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'bundled', 'package.json'), JSON.stringify({
      name: 'bundled', version: '1.2.2', dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: { bundled: '1.2.2' } }))
    const ctx = makeCtx({
      desktopProfiles: {
        current: { name: 'web' },
        list: () => [{ name: 'web', dir, webCapable: true }],
      },
    })
    const registryView = async () => ({
      ok: true, package: 'bundled', latest: '1.5.1', publishedAt: '2025-06-01T00:00:00Z', timeMap: {},
    }) as const
    const { host, routes } = makeHost({
      ctx,
      registryView,
      config: { profile: { name: 'web', dir, desktop: false } },
    })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/updates')!.handler(makeRequest({ method: 'GET' }), response)
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { updates: Array<{ bundle: string; outdated: boolean; latest: string }> }
    expect(payload.updates).toEqual([{ bundle: 'bundled', installed: '1.2.2', latest: '1.5.1', outdated: true, releaseAgeDays: expect.any(Number) }])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('POST /api/profile-panel/update (F3)', () => {
  it('rejects cross-origin requests', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/update')!.handler(
      makeRequest({
        method: 'POST',
        headers: { origin: 'https://evil.example', host: '127.0.0.1:5140' },
      }, '{}'),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('rejects non-registry specs', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/update')!.handler(
      trustedRequest('POST', JSON.stringify({ package: '../evil' })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })

  it('returns 409 while another install is running', async () => {
    const { host, routes } = makeHost({ state: { installing: true } })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/update')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'dshmarket' })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(409)
  })
})

describe('POST /api/profile-panel/align (F3)', () => {
  it('rejects cross-origin requests', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/align')!.handler(
      makeRequest({
        method: 'POST',
        headers: { origin: 'https://evil.example', host: '127.0.0.1:5140' },
      }, '{}'),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('requires a non-empty profiles array', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/align')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'dshmarket', profiles: [] })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })

  it('returns 501 without a registry viewer (latest resolution needed)', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/align')!.handler(
      trustedRequest('POST', JSON.stringify({ package: 'dshmarket', profiles: ['web'] })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(501)
  })
})

describe('GET /api/profile-panel/diff (F7)', () => {
  it('requires exactly two profile names', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/diff')!.handler(makeRequest({ url: '/api/profile-panel/diff' }), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })

  it('rejects unknown profiles', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/diff')!.handler(
      makeRequest({ url: '/api/profile-panel/diff?profiles=ghost,phantom' }),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })

  it('diffs two real profiles', async () => {
    const dirA = join(process.cwd(), 'tests', 'tmp', `diff-a-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const dirB = join(process.cwd(), 'tests', 'tmp', `diff-b-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    for (const [dir, version] of [[dirA, '1.2.2'], [dirB, '1.5.1']] as const) {
      mkdirSync(join(dir, 'node_modules', 'bundled'), { recursive: true })
      writeFileSync(join(dir, 'node_modules', 'bundled', 'package.json'), JSON.stringify({
        name: 'bundled', version, dsh: { bundle: { patch: './x.yml' } },
      }))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: { bundled: version } }))
    }
    const ctx = makeCtx({
      desktopProfiles: {
        current: { name: 'a' },
        list: () => [
          { name: 'a', dir: dirA, webCapable: true },
          { name: 'b', dir: dirB, webCapable: true },
        ],
      },
    })
    const { host, routes } = makeHost({ ctx })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/diff')!.handler(
      makeRequest({ url: '/api/profile-panel/diff?profiles=a,b' }),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { versionDiffers: Array<{ bundle: string; a: string; b: string }> }
    expect(payload.versionDiffers).toEqual([{ bundle: 'bundled', a: '1.2.2', b: '1.5.1' }])
    rmSync(dirA, { recursive: true, force: true })
    rmSync(dirB, { recursive: true, force: true })
  })
})

describe('GET /api/profile-panel/events (F4 SSE)', () => {
  it('returns 405 for POSTs', async () => {
    const { host, routes } = makeHost({ events: createPanelEventBus() })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/events')!.handler(makeRequest({ method: 'POST' }), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(405)
  })

  it('returns 501 when the host has no event bus', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/events')!.handler(makeRequest(), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(501)
  })

  it('streams published events and heartbeats', async () => {
    vi.useFakeTimers()
    try {
      const bus = createPanelEventBus()
      const { host, routes } = makeHost({ events: bus })
      mountPanelRoutes(host)
      const response = makeResponse()
      await routes.get('/api/profile-panel/events')!.handler(makeRequest(), response)
      const fake = response as unknown as FakeResponse
      expect(fake.statusCode).toBe(200)
      expect(fake.headers['content-type']).toContain('text/event-stream')
      bus.publish({ type: 'pending', profile: 'desktop', changes: null })
      expect(fake.stream).toContain('event: pending')
      expect(fake.stream).toContain('"profile":"desktop"')
      vi.advanceTimersByTime(31_000)
      expect(fake.stream).toContain(': ping')
    } finally {
      vi.useRealTimers()
    }
  })

  it('caps concurrent connections at 8', async () => {
    const { host, routes } = makeHost({ events: createPanelEventBus() })
    mountPanelRoutes(host)
    for (let index = 0; index < 8; index++) {
      const response = makeResponse()
      await routes.get('/api/profile-panel/events')!.handler(makeRequest(), response)
      expect((response as unknown as FakeResponse).statusCode).toBe(200)
    }
    const ninth = makeResponse()
    await routes.get('/api/profile-panel/events')!.handler(makeRequest(), ninth)
    expect((ninth as unknown as FakeResponse).statusCode).toBe(503)
  })

  it('releases a connection slot when the request closes', async () => {
    const { host, routes } = makeHost({ events: createPanelEventBus() })
    mountPanelRoutes(host)
    const open: Array<ReturnType<typeof makeRequest>> = []
    for (let index = 0; index < 8; index++) {
      const request = makeRequest()
      open.push(request)
      await routes.get('/api/profile-panel/events')!.handler(request, makeResponse())
    }
    const ninth = makeResponse()
    await routes.get('/api/profile-panel/events')!.handler(makeRequest(), ninth)
    expect((ninth as unknown as FakeResponse).statusCode).toBe(503)
    // Closing one connection frees a slot for a new subscriber.
    open[0]!.emitClose()
    const reopened = makeResponse()
    await routes.get('/api/profile-panel/events')!.handler(makeRequest(), reopened)
    expect((reopened as unknown as FakeResponse).statusCode).toBe(200)
  })
})

describe('GET /api/profile-panel/poll (F4 fallback)', () => {
  it('returns immediately when a newer event exists', async () => {
    const bus = createPanelEventBus()
    bus.publish({ type: 'clean', profile: 'desktop' })
    const { host, routes } = makeHost({ events: bus })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/poll')!.handler(makeRequest({ url: '/api/profile-panel/poll?since=0' }), response)
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { seq: number; status: unknown }
    expect(payload.seq).toBe(1)
    expect(payload.status).toBeDefined()
  })

  it('waits for the next event up to the timeout', async () => {
    vi.useFakeTimers()
    try {
      const bus = createPanelEventBus()
      const { host, routes } = makeHost({ events: bus })
      mountPanelRoutes(host)
      const response = makeResponse()
      const pending = routes.get('/api/profile-panel/poll')!.handler(makeRequest({ url: '/api/profile-panel/poll?since=0' }), response)
      let settled = false
      void pending.then(() => { settled = true })
      expect(settled).toBe(false)
      vi.advanceTimersByTime(26_000)
      await pending
      expect(settled).toBe(true)
      expect((response as unknown as FakeResponse).statusCode).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns 501 when the host has no event bus', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/poll')!.handler(makeRequest({ url: '/api/profile-panel/poll?since=0' }), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(501)
  })
})

describe('GET /api/profile-panel/audit (F10)', () => {
  it('reads entries from the current profile directory', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `route-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    appendAudit(dir, { action: 'install', profile: 'web', package: 'dshmarket', ok: true })
    const { host, routes } = makeHost({ config: { profile: { name: 'web', dir, desktop: false } } })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/audit')!.handler(makeRequest({ url: '/api/profile-panel/audit?limit=10' }), response)
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { total: number; entries: Array<{ action: string }> }
    expect(payload.total).toBe(1)
    expect(payload.entries[0]?.action).toBe('install')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('GET /api/profile-panel/boot-report (F9)', () => {
  it('returns 501 when the host has no boot-report reader', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/boot-report')!.handler(makeRequest(), response)
    expect((response as unknown as FakeResponse).statusCode).toBe(501)
  })

  it('returns the live boot projection', async () => {
    const { host, routes } = makeHost({
      readBootReport: () => ({
        bootedAt: '2025-06-13T00:00:00Z',
        entries: [{ id: 'a', module: 'dshmarket', phase: 'active' }],
      }),
    })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/boot-report')!.handler(makeRequest(), response)
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    const payload = JSON.parse(fake.body) as { entries: Array<{ module: string }> }
    expect(payload.entries[0]?.module).toBe('dshmarket')
  })
})

describe('POST /api/profile-panel/hot-reload (F12)', () => {
  it('rejects cross-origin requests', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/hot-reload')!.handler(
      makeRequest({
        method: 'POST',
        headers: { origin: 'https://evil.example', host: '127.0.0.1:5140' },
      }, '{}'),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(403)
  })

  it('rejects invalid bundle names', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/hot-reload')!.handler(
      trustedRequest('POST', JSON.stringify({ bundle: '../evil' })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })

  it('declines bundles without hot-reload capability', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `hr-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(dir, 'node_modules', 'plain'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'plain', 'package.json'), JSON.stringify({ name: 'plain', version: '1.0.0' }))
    const { host, routes } = makeHost({ config: { profile: { name: 'web', dir, desktop: false } } })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/hot-reload')!.handler(
      trustedRequest('POST', JSON.stringify({ bundle: 'plain' })),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(501)
    rmSync(dir, { recursive: true, force: true })
  })

  it('hot-reloads a capable bundle through the injected executor', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `hr2-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(dir, 'node_modules', 'hotpkg'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'hotpkg', 'package.json'), JSON.stringify({ name: 'hotpkg', version: '1.0.0', dsh: { hot: true } }))
    const hotReload = vi.fn(() => ({ ok: true }))
    const { host, routes } = makeHost({
      config: { profile: { name: 'web', dir, desktop: false } },
      hotReload,
    })
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/hot-reload')!.handler(
      trustedRequest('POST', JSON.stringify({ bundle: 'hotpkg' })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    expect(hotReload).toHaveBeenCalledWith('hotpkg')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('POST /api/profile-panel/cancel-restart + autoRestart (F13)', () => {
  function fakePnpm(mutate: () => void) {
    return {
      run: (args: string[], _signal?: AbortSignal) => {
        mutate()
        const stdout = new Readable({ read() { this.push('ok\n'); this.push(null) } })
        const stderr = new Readable({ read() { this.push(''); this.push(null) } })
        return {
          stdout,
          stderr,
          done: Promise.resolve({ exitCode: 0, signal: null }),
          cancel() {},
        }
      },
    }
  }

  it('requires a cancelToken', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/cancel-restart')!.handler(
      trustedRequest('POST', JSON.stringify({})),
      response,
    )
    expect((response as unknown as FakeResponse).statusCode).toBe(400)
  })

  it('reports cancelled:false for an unknown token', async () => {
    const { host, routes } = makeHost()
    mountPanelRoutes(host)
    const response = makeResponse()
    await routes.get('/api/profile-panel/cancel-restart')!.handler(
      trustedRequest('POST', JSON.stringify({ cancelToken: 'nope' })),
      response,
    )
    const fake = response as unknown as FakeResponse
    expect(fake.statusCode).toBe(200)
    expect(JSON.parse(fake.body)).toEqual({ cancelled: false })
  })

  it('schedules an auto-restart after a successful current-only install and honors its cancellation', async () => {
    vi.useFakeTimers()
    try {
      const dir = join(process.cwd(), 'tests', 'tmp', `autorb-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      mkdirSync(join(dir, 'node_modules', 'dshmarket'), { recursive: true })
      writeFileSync(join(dir, 'node_modules', 'dshmarket', 'package.json'), JSON.stringify({
        name: 'dshmarket', version: '1.5.1', dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {} }))
      const requestRestart = vi.fn()
      const ctx = makeCtx({
        desktopRuntime: { requestRestart },
        desktopProfiles: {
          current: { name: 'web' },
          list: () => [{ name: 'web', dir, webCapable: true }],
        },
        desktopPnpm: fakePnpm(() => {
          const manifest = readProfileManifest(dir)
          manifest.dependencies = { ...(manifest.dependencies ?? {}), dshmarket: '1.5.1' }
          writeProfileManifest(dir, manifest)
        }),
      })
      const { host, routes } = makeHost({
        ctx,
        config: { profile: { name: 'web', dir, desktop: true } },
      })
      mountPanelRoutes(host)
      const response = makeResponse()
      await routes.get('/api/profile-panel/install')!.handler(
        trustedRequest('POST', JSON.stringify({ package: 'dshmarket', spec: '1.5.1', autoRestart: true })),
        response,
      )
      const fake = response as unknown as FakeResponse
      expect(fake.statusCode).toBe(200)
      const payload = JSON.parse(fake.body) as { autoRestart?: { scheduled: boolean; cancelToken: string }; overallOk: boolean }
      expect(payload.overallOk).toBe(true)
      expect(payload.autoRestart?.scheduled).toBe(true)
      expect(requestRestart).not.toHaveBeenCalled()
      // Cancel before the countdown fires.
      const cancelResponse = makeResponse()
      await routes.get('/api/profile-panel/cancel-restart')!.handler(
        trustedRequest('POST', JSON.stringify({ cancelToken: payload.autoRestart!.cancelToken })),
        cancelResponse,
      )
      expect(JSON.parse((cancelResponse as unknown as FakeResponse).body)).toEqual({ cancelled: true })
      vi.advanceTimersByTime(6000)
      expect(requestRestart).not.toHaveBeenCalled()
      rmSync(dir, { recursive: true, force: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips the auto-restart for multi-target installs', async () => {
    vi.useFakeTimers()
    try {
      const dirA = join(process.cwd(), 'tests', 'tmp', `autoskip-a-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      const dirB = join(process.cwd(), 'tests', 'tmp', `autoskip-b-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      for (const dir of [dirA, dirB]) {
        mkdirSync(join(dir, 'node_modules', 'dshmarket'), { recursive: true })
        writeFileSync(join(dir, 'node_modules', 'dshmarket', 'package.json'), JSON.stringify({
          name: 'dshmarket', version: '1.5.1', dsh: { bundle: { patch: './cordis.patch.yml' } },
        }))
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {} }))
      }
      const requestRestart = vi.fn()
      const ctx = makeCtx({
        desktopRuntime: { requestRestart },
        desktopProfiles: {
          current: { name: 'a' },
          list: () => [
            { name: 'a', dir: dirA, webCapable: true },
            { name: 'b', dir: dirB, webCapable: true },
          ],
        },
        desktopPnpm: fakePnpm(() => {
          // installIntoProfiles reads the manifest itself; nothing to mutate here.
        }),
      })
      const { host, routes } = makeHost({
        ctx,
        config: { profile: { name: 'a', dir: dirA, desktop: true } },
        desktop: { detected: true, reason: 'profile', desktopProfile: 'b' },
      })
      mountPanelRoutes(host)
      const response = makeResponse()
      await routes.get('/api/profile-panel/install')!.handler(
        trustedRequest('POST', JSON.stringify({ package: 'dshmarket', spec: '1.5.1', autoRestart: true, mode: 'dual' })),
        response,
      )
      const fake = response as unknown as FakeResponse
      expect(fake.statusCode).toBe(200)
      const payload = JSON.parse(fake.body) as { autoRestartSkipped?: boolean; autoRestart?: unknown }
      expect(payload.autoRestart).toBeUndefined()
      expect(payload.autoRestartSkipped).toBe(true)
      expect(requestRestart).not.toHaveBeenCalled()
      vi.advanceTimersByTime(6000)
      expect(requestRestart).not.toHaveBeenCalled()
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    } finally {
      vi.useRealTimers()
    }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
