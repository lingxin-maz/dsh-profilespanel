import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { buildToolDefs, registerPanelTools, type PanelToolsDeps } from '../../src/tools.ts'
import { createPanelEventBus } from '../../src/events.ts'
import type { PanelState } from '../../src/routes.ts'

function makeState(): PanelState {
  return {
    boot: {
      profileName: 'web',
      profileDir: 'x',
      bundles: ['@deepseek-ai/dsh-base'],
      dependencies: {},
      files: new Map(),
    },
    pendingRestart: true,
    changes: null,
    restarting: false,
    installing: false,
    profilesPending: [],
  }
}

function makeDeps(overrides: Partial<PanelToolsDeps> = {}): PanelToolsDeps {
  return {
    ctx: { get: () => undefined } as unknown as Context,
    state: makeState(),
    profile: { name: 'web', dir: 'x' },
    allowRestart: true,
    registryView: async () => ({ ok: true, package: 'x', latest: '1.0.0', publishedAt: null, timeMap: {} }),
    events: createPanelEventBus(),
    ...overrides,
  }
}

type ToolDef = {
  name: string
  parameters?: Record<string, unknown>
  execute?: (...args: unknown[]) => Promise<unknown> | unknown
}

describe('buildToolDefs (F11)', () => {
  it('registers the four panel tools with the official authoring shape', () => {
    const defs: Array<{ name: string }> = []
    let installParams: Record<string, unknown> | undefined
    const defineTool = (options: ToolDef) => {
      defs.push({ name: options.name })
      if (options.name === 'profile_sync_install') installParams = options.parameters
      return options
    }
    buildToolDefs(makeDeps(), defineTool)
    expect(defs.map(def => def.name)).toEqual([
      'profile_status',
      'profile_updates',
      'profile_sync_install',
      'profile_restart',
    ])
    expect(installParams?.package).toMatchObject({ type: 'string', required: true })
    expect(installParams?.mode).toMatchObject({ type: 'string' })
  })

  it('profile_status reports the compact panel state', async () => {
    let captured: ToolDef | undefined
    const defineTool = (options: ToolDef) => {
      if (options.name === 'profile_status') captured = options
      return options
    }
    buildToolDefs(makeDeps({ allowRestart: false }), defineTool)
    const payload = await captured?.execute?.() as Record<string, unknown>
    expect(payload.profileName).toBe('web')
    expect(payload.pendingRestart).toBe(true)
    expect(payload.restartAvailable).toBe(false)
    expect(payload.bundles).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('profile_sync_install rejects invalid targets before touching the executor', async () => {
    let captured: ToolDef | undefined
    const defineTool = (options: ToolDef) => {
      if (options.name === 'profile_sync_install') captured = options
      return options
    }
    buildToolDefs(makeDeps(), defineTool)
    const payload = await captured?.execute?.({ package: '../evil' }) as { ok: boolean; error: string }
    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('invalid package name')
  })

  it('profile_restart honors allowRestart=false', async () => {
    let captured: ToolDef | undefined
    const defineTool = (options: ToolDef) => {
      if (options.name === 'profile_restart') captured = options
      return options
    }
    buildToolDefs(makeDeps({ allowRestart: false }), defineTool)
    const payload = await captured?.execute?.() as { ok: boolean; error: string }
    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('disabled')
  })

  it('profile_restart schedules the desktop restart', async () => {
    vi.useFakeTimers()
    try {
      const requestRestart = vi.fn()
      const ctx = {
        get: (name: string) => (name === 'desktopRuntime' ? { requestRestart } : undefined),
      } as unknown as Context
      let captured: ToolDef | undefined
      const defineTool = (options: ToolDef) => {
        if (options.name === 'profile_restart') captured = options
        return options
      }
      buildToolDefs(makeDeps({ ctx }), defineTool)
      const payload = await captured?.execute?.() as { ok: boolean }
      expect(payload.ok).toBe(true)
      expect(requestRestart).not.toHaveBeenCalled()
      vi.advanceTimersByTime(200)
      expect(requestRestart).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('registerPanelTools (F11)', () => {
  it('is a no-op without a tool registry', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    await expect(registerPanelTools(ctx, makeDeps())).resolves.toBeUndefined()
  })

  it('does not touch ctx.tools directly when the service is optional', async () => {
    const ctx = {
      get: (name: string) => (name === 'tools' ? { register: vi.fn() } : undefined),
      get tools() {
        throw new Error('cannot get property "tools" without inject')
      },
    } as unknown as Context
    await expect(registerPanelTools(ctx, makeDeps())).resolves.toBeUndefined()
  })

  it('skips registration when the host module is unavailable', async () => {
    const register = vi.fn()
    const ctx = {
      get: () => undefined,
      tools: { register },
    } as unknown as Context
    await registerPanelTools(ctx, makeDeps())
    expect(register).not.toHaveBeenCalled()
  })
})
