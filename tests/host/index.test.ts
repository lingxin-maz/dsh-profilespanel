import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../../src/index.ts'

interface RouteEntry {
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

interface FakeResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

function makeResponse(): ServerResponse {
  const fake: FakeResponse & {
    writeHead(status: number, headers?: Record<string, string>): void
    end(chunk?: string): void
  } = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      fake.statusCode = status
      Object.assign(fake.headers, headers ?? {})
    },
    end(chunk) {
      fake.body = chunk ?? ''
    },
  }
  return fake as unknown as ServerResponse
}

function makeRequest(url: string): IncomingMessage {
  return {
    method: 'GET',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    url,
  } as unknown as IncomingMessage
}

describe('apply', () => {
  it('serves the boot report without touching ctx.loader directly', async () => {
    const routes = new Map<string, RouteEntry>()
    const services = {
      desktopProfiles: {
        current: { name: 'web', dir: 'C:\\fake\\web' },
        list: () => [] as unknown[],
      },
      loader: {
        entries: () => [{ id: 'demo-bundle', phase: 'active' }],
      },
    }
    const ctx = {
      get: (name: string) => services[name as keyof typeof services],
      effect: () => undefined,
      inject: (_keys: string[], callback: (hostCtx: Context) => void) => {
        callback({
          webServer: {
            register(route: { path: string; handler: RouteEntry['handler'] }) {
              routes.set(route.path, route)
              return () => routes.delete(route.path)
            },
          },
          effect: (mount: () => () => void) => {
            mount()
          },
        } as unknown as Context)
      },
      logger: { warn: vi.fn(), error: vi.fn() },
      get loader() {
        throw new Error('cannot get property "loader" without inject')
      },
    } as unknown as Context

    apply(ctx)

    const response = makeResponse()
    await routes.get('/api/profile-panel/boot-report')!.handler(
      makeRequest('/api/profile-panel/boot-report'),
      response,
    )

    const payload = JSON.parse((response as unknown as FakeResponse).body) as { entries: Array<{ id: string; phase: string }> }
    expect((response as unknown as FakeResponse).statusCode).toBe(200)
    expect(payload.entries).toEqual([{ id: 'demo-bundle', phase: 'active' }])
  })
})
