import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import * as clientEntry from '../../src/client/index.tsx'

describe('client entry', () => {
  it('registers a settings.section named profile-panel with locale dictionaries', () => {
    const registered: Array<{ meta: Record<string, unknown> }> = []
    const ctx = {
      effect: vi.fn((callback: () => unknown) => callback()),
      locale: {
        register: vi.fn(),
        bind: vi.fn(() => (key: string) => key),
      },
      slots: {
        inject: vi.fn((_slot: string, register: () => unknown) => register()),
        register: vi.fn((meta: Record<string, unknown>, component: unknown) => {
          registered.push({ meta })
          return { meta, component }
        }),
      },
    }
    clientEntry.apply(ctx as never)
    expect(clientEntry.name).toBe('dsh-profile-panel')
    expect(clientEntry.inject).toEqual(['slots', 'locale'])
    expect(ctx.locale.register).toHaveBeenCalledWith('dsh-profile-panel', expect.objectContaining({ zh: expect.any(Object), en: expect.any(Object) }))
    expect(ctx.slots.inject).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(registered[0]?.meta).toMatchObject({ name: 'settings.section', id: 'profile-panel' })
  })

  it('renders the panel component through the registered factory', () => {
    const registered: Array<{ component: () => unknown }> = []
    const ctx = {
      effect: vi.fn((callback: () => unknown) => callback()),
      locale: {
        register: vi.fn(),
        bind: vi.fn(() => (key: string) => key),
      },
      slots: {
        inject: vi.fn((_slot: string, register: () => unknown) => register()),
        register: vi.fn((_meta: Record<string, unknown>, component: () => unknown) => {
          registered.push({ component })
          return { component }
        }),
      },
    }
    clientEntry.apply(ctx as never)
    const node = registered[0]?.component() as { type?: unknown }
    expect(node).not.toBeNull()
    // h(Panel, ...) → element with a function type (the Panel component)
    expect(typeof node?.type).toBe('function')
    void h
  })
})
