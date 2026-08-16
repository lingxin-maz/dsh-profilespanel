/**
 * Regression test for the browser boot path: the desktop web kernel
 * (dsh-client-web) materializes `client/client.js` through
 * window.__ModuleLoader__.load's factory with ONLY `require` in scope. The
 * factory body must self-contain its CJS preamble — a missing
 * `var module/exports` pair throws "exports is not defined" and bricks the
 * whole web boot ("Failed to load plugins"). Executes the real built
 * artifact, not the sources.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as primitives from './mocks/primitives.tsx'

interface ModuleLoaderEntry {
  id: string
  factory: (require: (id: string) => unknown) => Record<string, unknown>
}

async function requireAsync(id: string): Promise<unknown> {
  switch (id) {
    case 'react': return await import('react')
    case 'react/jsx-runtime': return await import('react/jsx-runtime')
    case '@deepseek-ai/dsh-client-ui-primitives': return primitives
    default: throw new Error(`unexpected module-table require: ${id}`)
  }
}

describe('built client bundle executes as a ModuleLoader factory', () => {
  it('materializes the factory with only require in scope', async () => {
    const bundlePath = join(process.cwd(), 'client', 'client.js')
    if (!existsSync(bundlePath)) {
      throw new Error('client/client.js is missing — run `pnpm run build` before the client tests')
    }
    const code = readFileSync(bundlePath, 'utf8')
    let captured: ModuleLoaderEntry | null = null
    const win = window as unknown as { __ModuleLoader__: { load(entry: ModuleLoaderEntry): void } }
    win.__ModuleLoader__ = {
      load(entry) {
        captured = entry
      },
    }
    // Evaluate the artifact exactly like the browser script tag does.
    // eslint-disable-next-line no-new-func
    new Function(code)()

    expect(captured).not.toBeNull()
    expect(captured?.id).toBe('dsh-profile-panel')

    // Pre-resolve the platform modules the factory requires (ESM is async,
    // the table require is sync — resolve first, then hand over namespaces).
    const table = new Map<string, unknown>()
    for (const id of ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives']) {
      table.set(id, await requireAsync(id))
    }
    const require = (id: string): unknown => {
      const value = table.get(id)
      if (value === undefined) throw new Error(`module table miss: ${id}`)
      return value
    }

    const exportsObj = captured!.factory(require)
    expect(exportsObj.name).toBe('dsh-profile-panel')
    expect(exportsObj.inject).toEqual(['slots', 'locale'])
    expect(typeof exportsObj.apply).toBe('function')
  })
})
