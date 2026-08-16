import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement as h } from 'react'
import { Panel } from '../../src/client/panel.tsx'
import { installMarketBridge, INSTALL_TARGET_EVENT } from '../../src/client/market-bridge.ts'
import { zh } from '../../src/client/locales.ts'
import type { PanelStatus } from '../../src/client/status-data.ts'

const t = (key: string): string => zh[key] ?? key

/** Only the profile-row checkboxes (excludes preview/rollback toggles). */
function profileBoxes(): HTMLInputElement[] {
  return screen.getAllByRole('checkbox')
    .filter(box => box.closest('.dshpp-profileRow') !== null) as HTMLInputElement[]
}

function makeStatus(overrides: Partial<PanelStatus> = {}): PanelStatus {
  return {
    profileName: 'desktop',
    profileDir: 'C:\\Users\\me\\.dsh\\profiles\\desktop',
    profileExists: true,
    bundles: [
      { name: '@deepseek-ai/dsh-base', state: 'loaded' },
      { name: 'dshmarket', state: 'pending' },
    ],
    pendingRestart: false,
    changes: null,
    restart: { available: true, restarting: false, hint: '' },
    profiles: [
      { name: 'desktop', dir: 'C:\\Users\\me\\.dsh\\profiles\\desktop', current: true },
      { name: 'web', dir: 'C:\\Users\\me\\.dsh\\profiles\\web', current: false },
    ],
    desktop: { detected: false, reason: 'none' },
    minimumReleaseAgeDays: 7,
    profilesPending: [],
    ...overrides,
  }
}

function stubFetch(overrides: {
  status?: PanelStatus
  restart?: { ok: boolean; status: number; payload?: unknown }
  install?: { ok: boolean; payload: unknown }
  preview?: { ok: boolean; payload: unknown }
  market?: { ok: boolean; payload: unknown }
  undo?: { ok: boolean; payload: unknown }
  updates?: { ok: boolean; payload: unknown }
  update?: { ok: boolean; payload: unknown }
  align?: { ok: boolean; payload: unknown }
  health?: { ok: boolean; payload: unknown }
  diff?: { ok: boolean; payload: unknown }
  audit?: { ok: boolean; payload: unknown }
  bootReport?: { ok: boolean; payload: unknown }
  hotReload?: { ok: boolean; payload: unknown }
  cancelRestart?: { ok: boolean; payload: unknown }
} = {}): ReturnType<typeof vi.fn> {
  const status = overrides.status ?? makeStatus()
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/restart')) {
      const payload = overrides.restart?.payload ?? { ok: true, restarting: true }
      return {
        ok: overrides.restart?.ok ?? true,
        status: overrides.restart?.status ?? 202,
        json: async () => payload,
      }
    }
    if (url.includes('/install-preview')) {
      const payload = overrides.preview?.payload ?? { ok: true, package: 'dshmarket', spec: null, latest: null, publishedAt: null, releaseAgeDays: null, minimumReleaseAgeDays: 7, warnings: [], suggestedPin: null }
      return {
        ok: overrides.preview?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/undo')) {
      const payload = overrides.undo?.payload ?? { ok: true, results: [] }
      return {
        ok: overrides.undo?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/updates')) {
      const payload = overrides.updates?.payload ?? { profile: 'desktop', updatedAt: '', updates: [] }
      return {
        ok: overrides.updates?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/update')) {
      const payload = overrides.update?.payload ?? { overallOk: true, results: [] }
      return {
        ok: overrides.update?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/align')) {
      const payload = overrides.align?.payload ?? { overallOk: true, results: [] }
      return {
        ok: overrides.align?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/health')) {
      const payload = overrides.health?.payload ?? { profile: 'desktop', ok: true, nextBundles: [], issues: [] }
      return {
        ok: overrides.health?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/diff')) {
      const payload = overrides.diff?.payload ?? { profiles: ['desktop', 'web'], onlyInA: [], onlyInB: [], versionDiffers: [] }
      return {
        ok: overrides.diff?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/boot-report')) {
      const payload = overrides.bootReport?.payload ?? { bootedAt: '', entries: [] }
      return {
        ok: overrides.bootReport?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/hot-reload')) {
      const payload = overrides.hotReload?.payload ?? { ok: true }
      return {
        ok: overrides.hotReload?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/cancel-restart')) {
      const payload = overrides.cancelRestart?.payload ?? { cancelled: true }
      return {
        ok: overrides.cancelRestart?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/audit')) {
      const payload = overrides.audit?.payload ?? { total: 0, entries: [] }
      return {
        ok: overrides.audit?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/market/search')) {
      const payload = overrides.market?.payload ?? { ok: true, source: 'live', updated: null, total: 0, query: '', results: [] }
      return {
        ok: overrides.market?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    if (url.includes('/install')) {
      const payload = overrides.install?.payload ?? { overallOk: true, results: [] }
      return {
        ok: overrides.install?.ok ?? true,
        status: 200,
        json: async () => payload,
      }
    }
    return { ok: true, status: 200, json: async () => status }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('Panel · profile + bundles', () => {
  it('renders the profile identity and bundle badges', async () => {
    stubFetch()
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getAllByText('desktop').length).toBeGreaterThan(0))
    expect(screen.getByText('dshmarket')).toBeTruthy()
    expect(screen.getAllByText(zh.loaded).length).toBeGreaterThan(0)
    expect(screen.getAllByText(zh.pending).length).toBeGreaterThan(0)
    // path is abbreviated to the home + profiles tail
    expect(screen.getByText(/~\\\.dsh\\profiles\\desktop/)).toBeTruthy()
  })

  it('keeps the banner hidden while the profile is clean', async () => {
    stubFetch()
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText('dshmarket')).toBeTruthy())
    expect(screen.queryByText(zh.restartBanner)).toBeNull()
  })

  it('shows the banner and change details when a restart is pending', async () => {
    stubFetch({
      status: makeStatus({
        pendingRestart: true,
        changes: {
          changedFiles: ['package.json', 'pnpm-lock.yaml'],
          addedBundles: ['dsh-profile-panel'],
          removedBundles: [],
        },
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.restartBanner)).toBeTruthy())
    expect(screen.getByText(/dsh-profile-panel/)).toBeTruthy()
  })

  it('shows the CLI hint when restart is unavailable', async () => {
    stubFetch({
      status: makeStatus({
        restart: { available: false, restarting: false, hint: 'restart from the terminal' },
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText('restart from the terminal')).toBeTruthy())
    expect(screen.queryByText(zh.restartButton)).toBeNull()
  })
})

describe('Panel · restart button states', () => {
  it('posts the restart and shows the submitted message', async () => {
    const fn = stubFetch()
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.restartButton)).toBeTruthy())
    fireEvent.click(screen.getByText(zh.restartButton))
    await waitFor(() => expect(screen.getAllByText(zh.restartRequested).length).toBeGreaterThan(0))
    const calls = fn.mock.calls.map(call => String(call[0]))
    expect(calls.some(url => url.includes('/restart'))).toBe(true)
  })

  it('disables the button and labels it while restarting', async () => {
    stubFetch({
      status: makeStatus({
        pendingRestart: true,
        restart: { available: true, restarting: true, hint: '' },
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getAllByText(zh.restarting).length).toBeGreaterThan(0))
    const buttons = screen.getAllByText(zh.restarting)
      .map(node => node.closest('button'))
      .filter((node): node is HTMLButtonElement => node !== null)
    expect(buttons.every(button => button.disabled)).toBe(true)
  })
})

describe('Panel · sync install section', () => {
  it('pre-selects the current profile and marks it', async () => {
    stubFetch()
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.currentBadge)).toBeTruthy())
    const boxes = profileBoxes()
    expect(boxes).toHaveLength(2)
    const desktop = boxes[0] as HTMLInputElement
    const web = boxes[1] as HTMLInputElement
    expect(desktop.checked).toBe(true)
    expect(web.checked).toBe(false)
  })

  it('installs into the selected profiles and renders per-profile results', async () => {
    const fn = stubFetch({
      install: {
        ok: true,
        payload: {
          overallOk: true,
          results: [
            { profile: 'desktop', ok: true, requestedVersion: '1.5.1', resolvedVersion: '1.2.2', downgraded: true },
            { profile: 'web', ok: false, error: 'pnpm EPERM' },
          ],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.currentBadge)).toBeTruthy())
    const boxes = profileBoxes()
    fireEvent.click(boxes[1] as HTMLInputElement) // select web too
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.change(screen.getByPlaceholderText(zh.versionPlaceholder), { target: { value: '1.5.1' } })
    fireEvent.click(screen.getByText(zh.installButton))
    await waitFor(() => expect(screen.getByText(/策略降级/)).toBeTruthy())
    expect(screen.getByText(/请求 1\.5\.1 实际 1\.2\.2/)).toBeTruthy()
    expect(screen.getByText(/pnpm EPERM/)).toBeTruthy()
    const calls = fn.mock.calls.map(call => String(call[0]))
    const installCall = fn.mock.calls.find(call => String(call[0]).includes('/install'))
    expect(installCall).toBeDefined()
    const body = JSON.parse(String((installCall?.[1] as RequestInit | undefined)?.body ?? '{}')) as {
      package: string
      spec: string
      profiles: string[]
    }
    expect(body.package).toBe('dshmarket')
    expect(body.spec).toBe('1.5.1')
    expect(body.profiles.sort()).toEqual(['desktop', 'web'])
  })

  it('offers per-profile retry on failure rows', async () => {
    const fn = stubFetch({
      install: {
        ok: true,
        payload: {
          overallOk: false,
          results: [{ profile: 'web', ok: false, error: 'pnpm EPERM' }],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.currentBadge)).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.click(screen.getByText(zh.installButton))
    await waitFor(() => expect(screen.getByText(/pnpm EPERM/)).toBeTruthy())
    fireEvent.click(screen.getByText(zh.retryProfile))
    await waitFor(() => {
      const calls = fn.mock.calls.filter(call => String(call[0]).includes('/install'))
      expect(calls.length).toBe(2)
      const body = JSON.parse(String((calls[1]?.[1] as RequestInit | undefined)?.body ?? '{}')) as { profiles: string[] }
      expect(body.profiles).toEqual(['web'])
    })
  })

  it('degrades to the unavailable state when the status endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.unavailable)).toBeTruthy())
    expect(screen.getByText(zh.retry)).toBeTruthy()
  })
})

describe('Panel · F16 dual-end install mode', () => {
  function dualStatus(): PanelStatus {
    return makeStatus({
      profiles: [
        { name: 'web', dir: 'C:\\Users\\me\\.dsh\\profiles\\web', current: true },
        { name: 'desktop', dir: 'C:\\Users\\me\\.dsh\\profiles\\desktop', current: false },
      ],
      desktop: { detected: true, reason: 'profile', profile: 'desktop' },
    })
  }

  it('hides the mode selector when no desktop GUI is detected', async () => {
    stubFetch()
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.currentBadge)).toBeTruthy())
    expect(screen.queryByText(zh.modeDual)).toBeNull()
    expect(screen.queryByText(zh.desktopDetectedHint)).toBeNull()
  })

  it('shows the selector and pre-selects both ends in dual mode', async () => {
    stubFetch({ status: dualStatus() })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.modeDual)).toBeTruthy())
    expect(screen.getByText(zh.desktopDetectedHint)).toBeTruthy()
    await waitFor(() => {
      const boxes = profileBoxes()
      expect(boxes).toHaveLength(2)
      expect(boxes.every(box => box.checked)).toBe(true)
    })
  })

  it('submits mode=dual and lets the host resolve the pair', async () => {
    const fn = stubFetch({ status: dualStatus() })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.modeDual)).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.click(screen.getByText(zh.installButton))
    await waitFor(() => {
      const call = fn.mock.calls.find(call => String(call[0]).includes('/install'))
      expect(call).toBeDefined()
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as { mode: string }
      expect(body.mode).toBe('dual')
    })
  })

  it('switches to single and back, resyncing the checkbox set', async () => {
    stubFetch({ status: dualStatus() })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.modeDual)).toBeTruthy())
    fireEvent.click(screen.getByText(zh.modeSingle))
    await waitFor(() => {
      const boxes = profileBoxes()
      expect(boxes[0]?.checked).toBe(true)
      expect(boxes[1]?.checked).toBe(false)
    })
    fireEvent.click(screen.getByText(zh.modeDual))
    await waitFor(() => expect(profileBoxes().every(box => box.checked)).toBe(true))
  })

  it('falls back to custom when a checkbox is toggled manually', async () => {
    const fn = stubFetch({ status: dualStatus() })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.modeDual)).toBeTruthy())
    fireEvent.click(screen.getByText(zh.modeCustom))
    fireEvent.click(profileBoxes()[1] as HTMLInputElement) // uncheck desktop
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.click(screen.getByText(zh.installButton))
    await waitFor(() => {
      const call = fn.mock.calls.find(call => String(call[0]).includes('/install'))
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as { profiles: string[]; mode?: string }
      expect(body.profiles).toEqual(['web'])
      expect(body.mode).toBeUndefined()
    })
  })

  it('disables dual when the desktop profile is not web-capable', async () => {
    stubFetch({
      status: makeStatus({
        profiles: [
          { name: 'web', dir: 'C:\\Users\\me\\.dsh\\profiles\\web', current: true },
        ],
        desktop: { detected: true, reason: 'app-data' },
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.dualUnavailable)).toBeTruthy())
    const dual = screen.getByText(zh.modeDual).closest('button')
    expect(dual?.disabled).toBe(true)
  })
})

describe('Panel · F1 preview + F2 rollback/undo', () => {
  it('runs the standalone preview and renders a release-age warning', async () => {
    const fn = stubFetch({
      preview: {
        ok: true,
        payload: {
          ok: true,
          package: 'dshmarket',
          spec: null,
          latest: '1.5.1',
          publishedAt: '2025-06-01T00:00:00Z',
          releaseAgeDays: 1,
          minimumReleaseAgeDays: 7,
          warnings: [{ code: 'release-age', message: 'too young' }],
          suggestedPin: '1.5.1',
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.previewButton)).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.click(screen.getByText(zh.previewButton))
    await waitFor(() => expect(screen.getByText(/too young/)).toBeTruthy())
    expect(screen.getAllByText(/1\.5\.1/).length).toBeGreaterThan(0)
    const calls = fn.mock.calls.map(call => String(call[0]))
    expect(calls.some(url => url.includes('/install-preview'))).toBe(true)
  })

  it('renders install warnings and rolled-back profiles from the response', async () => {
    stubFetch({
      install: {
        ok: true,
        payload: {
          overallOk: false,
          results: [{ profile: 'web', ok: false, error: 'boom' }],
          warnings: [{ code: 'dual-unavailable', message: 'desktop end unavailable' }],
          rolledBackProfiles: ['desktop'],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.installButton)).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.click(screen.getByText(zh.installButton))
    await waitFor(() => expect(screen.getByText(/dual-unavailable/)).toBeTruthy())
    expect(screen.getByText(/已自动回滚: desktop/)).toBeTruthy()
  })

  it('sends preview, rollback, and auto-restart flags from the checkboxes', async () => {
    const fn = stubFetch()
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.installButton)).toBeTruthy())
    const toggles = screen.getAllByRole('checkbox').filter(box => box.closest('.dshpp-checkRow') !== null) as HTMLInputElement[]
    expect(toggles).toHaveLength(3)
    fireEvent.click(toggles[0] as HTMLInputElement) // preview
    fireEvent.click(toggles[1] as HTMLInputElement) // rollback
    fireEvent.click(toggles[2] as HTMLInputElement) // autoRestart
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.click(screen.getByText(zh.installButton))
    await waitFor(() => {
      const call = fn.mock.calls.find(call => String(call[0]).includes('/install'))
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as { preview?: boolean; rollback?: boolean; autoRestart?: boolean }
      expect(body.preview).toBe(true)
      expect(body.rollback).toBe(true)
      expect(body.autoRestart).toBe(true)
    })
  })

  it('undoes the current targets and renders per-profile results', async () => {
    const fn = stubFetch({
      undo: {
        ok: true,
        payload: {
          ok: true,
          results: [{ profile: 'desktop', ok: true, restoredTs: 't', hint: 'run pnpm install' }],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.undoButton)).toBeTruthy())
    fireEvent.click(screen.getByText(zh.undoButton))
    await waitFor(() => expect(screen.getByText(/run pnpm install/)).toBeTruthy())
    const calls = fn.mock.calls.map(call => String(call[0]))
    expect(calls.some(url => url.includes('/undo'))).toBe(true)
  })
})

describe('Panel · F3 updates', () => {
  it('renders outdated rows from the updates feed', async () => {
    stubFetch({
      updates: {
        ok: true,
        payload: {
          profile: 'desktop',
          updatedAt: '2025-06-13T00:00:00Z',
          updates: [
            { bundle: 'dshmarket', installed: '1.2.2', latest: '1.5.1', outdated: true, releaseAgeDays: 12 },
            { bundle: 'current-plugin', installed: '1.0.0', latest: '1.0.0', outdated: false, releaseAgeDays: 90 },
          ],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(/1\.2\.2 → 1\.5\.1/)).toBeTruthy())
    expect(screen.getAllByText('dshmarket').length).toBeGreaterThan(0)
    // Up-to-date bundles are not listed in the updates card (noise-free feed).
    expect(screen.queryByText(/current-plugin → /)).toBeNull()
  })

  it('shows the all-up-to-date state for an empty outdated list', async () => {
    stubFetch({
      updates: {
        ok: true,
        payload: { profile: 'desktop', updatedAt: '', updates: [] },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.allUpToDate)).toBeTruthy())
    expect(screen.queryByRole('button', { name: zh.updateButton })).toBeNull()
  })

  it('posts an update with the latest version for one bundle', async () => {
    const fn = stubFetch({
      updates: {
        ok: true,
        payload: {
          profile: 'desktop',
          updatedAt: '',
          updates: [{ bundle: 'dshmarket', installed: '1.2.2', latest: '1.5.1', outdated: true, releaseAgeDays: 12 }],
        },
      },
      update: {
        ok: true,
        payload: { overallOk: true, results: [{ profile: 'desktop', ok: true, resolvedVersion: '1.5.1' }] },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(/1\.2\.2 → 1\.5\.1/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: zh.updateButton }))
    await waitFor(() => {
      const call = fn.mock.calls.find(call => String(call[0]).endsWith('/update'))
      expect(call).toBeDefined()
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as { package: string; spec: string }
      expect(body.package).toBe('dshmarket')
      expect(body.spec).toBe('1.5.1')
    })
    await waitFor(() => expect(screen.getAllByText(zh.resolvedAs + ' 1.5.1').length).toBeGreaterThan(0))
  })

  it('posts an align across every profile when several exist', async () => {
    const fn = stubFetch({
      updates: {
        ok: true,
        payload: {
          profile: 'desktop',
          updatedAt: '',
          updates: [{ bundle: 'dshmarket', installed: '1.2.2', latest: '1.5.1', outdated: true, releaseAgeDays: 12 }],
        },
      },
      align: {
        ok: true,
        payload: { overallOk: true, results: [] },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.alignButton)).toBeTruthy())
    fireEvent.click(screen.getByText(zh.alignButton))
    await waitFor(() => {
      const call = fn.mock.calls.find(call => String(call[0]).includes('/align'))
      expect(call).toBeDefined()
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as { package: string; profiles: string[]; version: string }
      expect(body.package).toBe('dshmarket')
      expect(body.profiles.sort()).toEqual(['desktop', 'web'])
      expect(body.version).toBe('1.5.1')
    })
  })
})

describe('Panel · F5 other-profile pending states', () => {
  it('shows the other-profiles bar when the current profile is clean', async () => {
    stubFetch({
      status: makeStatus({
        pendingRestart: false,
        profilesPending: [{ profile: 'web', pendingRestart: true, changes: null }],
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.othersPending)).toBeTruthy())
    expect(screen.getByText(zh.othersPending).textContent).toBe(zh.othersPending)
    expect(screen.getAllByText('web').length).toBeGreaterThan(0)
  })

  it('keeps the bar hidden when nothing else is pending', async () => {
    stubFetch()
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText('dshmarket')).toBeTruthy())
    expect(screen.queryByText(zh.othersPending)).toBeNull()
  })
})

describe('Panel · F4 SSE-first status transport', () => {
  it('opens the event stream and subscribes to panel events', async () => {
    class FakeEventSource {
      static instances: FakeEventSource[] = []
      url: string
      listeners = new Map<string, Set<() => void>>()
      onmessage: (() => void) | null = null
      onerror: (() => void) | null = null
      closed = false
      constructor(url: string) {
        this.url = url
        FakeEventSource.instances.push(this)
      }
      addEventListener(type: string, listener: () => void) {
        const set = this.listeners.get(type) ?? new Set<() => void>()
        set.add(listener)
        this.listeners.set(type, set)
      }
      close() {
        this.closed = true
      }
    }
    vi.stubGlobal('EventSource', FakeEventSource)
    try {
      stubFetch()
      render(h(Panel, { t }))
      await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
      const source = FakeEventSource.instances[0]!
      expect(source.url).toContain('/events')
      expect(source.listeners.has('pending')).toBe(true)
      expect(source.listeners.has('installed')).toBe(true)
      expect(source.closed).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('falls back to polling after repeated stream errors', async () => {
    class FakeEventSource {
      static instances: FakeEventSource[] = []
      url: string
      onerror: (() => void) | null = null
      closed = false
      constructor(url: string) {
        this.url = url
        FakeEventSource.instances.push(this)
      }
      addEventListener() {}
      close() {
        this.closed = true
      }
    }
    vi.stubGlobal('EventSource', FakeEventSource)
    const fn = stubFetch()
    try {
      render(h(Panel, { t }))
      await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
      const source = FakeEventSource.instances[0]!
      const callsBefore = fn.mock.calls.filter(call => String(call[0]).includes('/status')).length
      source.onerror?.()
      source.onerror?.()
      expect(source.closed).toBe(true)
      // The 2s poll keeps refreshing status after the stream gave up.
      await waitFor(() => {
        const calls = fn.mock.calls.filter(call => String(call[0]).includes('/status'))
        expect(calls.length).toBeGreaterThan(callsBefore)
      }, { timeout: 4000 })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Panel · F6 health card', () => {
  it('renders issues and the next-boot preview', async () => {
    stubFetch({
      health: {
        ok: true,
        payload: {
          profile: 'desktop',
          ok: false,
          nextBundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket'],
          issues: [
            { severity: 'error', code: 'missing-package', bundle: 'gone', message: '缺失: gone' },
            { severity: 'warning', code: 'peer-gap', bundle: 'bundled', message: 'peer 未满足' },
          ],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(/缺失: gone/)).toBeTruthy())
    expect(screen.getByText(/peer 未满足/)).toBeTruthy()
    expect(screen.getAllByText(/dshmarket/).length).toBeGreaterThan(0)
    expect(screen.queryByText(zh.healthOk)).toBeNull()
  })

  it('shows the healthy state when nothing is wrong', async () => {
    stubFetch({
      health: {
        ok: true,
        payload: { profile: 'desktop', ok: true, nextBundles: [], issues: [] },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.healthOk)).toBeTruthy())
  })
})

describe('Panel · F8 attribution + F7 compare', () => {
  it('renders bundle source tags', async () => {
    stubFetch({
      status: makeStatus({
        bundles: [
          { name: '@deepseek-ai/dsh-base', state: 'loaded', source: 'inbox', layerIndex: 0, hotReloadable: false },
          { name: 'dshmarket', state: 'loaded', source: 'dependency', layerIndex: 1, hotReloadable: true },
        ],
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.sourceInbox)).toBeTruthy())
    expect(screen.getByText(zh.sourceDependency)).toBeTruthy()
    expect(screen.getByText(zh.hotTag)).toBeTruthy()
  })

  it('renders the profile diff rows', async () => {
    stubFetch({
      diff: {
        ok: true,
        payload: {
          profiles: ['desktop', 'web'],
          onlyInA: ['plugin-x'],
          onlyInB: [],
          versionDiffers: [{ bundle: 'dshmarket', a: '1.2.2', b: '1.5.1' }],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(/plugin-x/)).toBeTruthy())
    expect(screen.getByText(/1\.2\.2 ↔ 1\.5\.1/)).toBeTruthy()
  })

  it('shows the identical state when nothing differs', async () => {
    stubFetch({
      diff: {
        ok: true,
        payload: { profiles: ['desktop', 'web'], onlyInA: [], onlyInB: [], versionDiffers: [] },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.compareSame)).toBeTruthy())
  })
})

describe('Panel · F9 boot report + F10 audit', () => {
  it('renders failed boot entries with their errors', async () => {
    stubFetch({
      bootReport: {
        ok: true,
        payload: {
          bootedAt: '2025-06-13T00:00:00Z',
          entries: [
            { id: 'a', module: 'dshmarket', phase: 'active' },
            { id: 'b', module: 'broken-plugin', phase: 'failed', error: 'cannot resolve' },
          ],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(/cannot resolve/)).toBeTruthy())
    expect(screen.getByText(/broken-plugin/)).toBeTruthy()
    expect(screen.queryByText(zh.bootAllActive)).toBeNull()
  })

  it('shows the all-active state for a clean boot', async () => {
    stubFetch({
      bootReport: {
        ok: true,
        payload: { bootedAt: '', entries: [{ id: 'a', module: 'x', phase: 'active' }] },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.bootAllActive)).toBeTruthy())
  })

  it('renders the audit timeline with failures highlighted', async () => {
    stubFetch({
      audit: {
        ok: true,
        payload: {
          total: 2,
          entries: [
            { ts: 1750000000000, action: 'install', profile: 'desktop', package: 'dshmarket', spec: '1.5.1', ok: true },
            { ts: 1750000001000, action: 'update', profile: 'web', package: 'dshmarket', ok: false, error: 'boom' },
          ],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy())
    expect(screen.getAllByText(/dshmarket/).length).toBeGreaterThan(0)
    expect(screen.getByText(zh.auditCard)).toBeTruthy()
  })

  it('shows the empty audit state', async () => {
    stubFetch({
      audit: {
        ok: true,
        payload: { total: 0, entries: [] },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.auditEmpty)).toBeTruthy())
  })
})

describe('Panel · F12 hot reload + F13 auto-restart + F14 desktop selection', () => {
  it('offers hot reload for a pending, hot-capable bundle', async () => {
    const fn = stubFetch({
      status: makeStatus({
        bundles: [
          { name: '@deepseek-ai/dsh-base', state: 'loaded', source: 'inbox', layerIndex: 0, hotReloadable: false },
          { name: 'hot-plugin', state: 'pending', source: 'dependency', layerIndex: 1, hotReloadable: true },
        ],
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.hotReloadButton)).toBeTruthy())
    fireEvent.click(screen.getByText(zh.hotReloadButton))
    await waitFor(() => {
      const call = fn.mock.calls.find(call => String(call[0]).includes('/hot-reload'))
      expect(call).toBeDefined()
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as { bundle: string }
      expect(body.bundle).toBe('hot-plugin')
    })
  })

  it('shows the auto-restart countdown and cancels it', async () => {
    const fn = stubFetch({
      install: {
        ok: true,
        payload: {
          overallOk: true,
          results: [{ profile: 'desktop', ok: true, resolvedVersion: '1.5.1' }],
          autoRestart: { scheduled: true, inMs: 5000, cancelToken: 'token-1' },
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.installButton)).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.click(screen.getByText(zh.installButton))
    await waitFor(() => expect(screen.getByText(/5s/)).toBeTruthy())
    fireEvent.click(screen.getByText(zh.cancelRestart))
    await waitFor(() => {
      const call = fn.mock.calls.find(call => String(call[0]).includes('/cancel-restart'))
      expect(call).toBeDefined()
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as { cancelToken: string }
      expect(body.cancelToken).toBe('token-1')
    })
    await waitFor(() => expect(screen.queryByText(/5s/)).toBeNull())
  })

  it('shows the skipped hint when the host declines the auto-restart', async () => {
    stubFetch({
      install: {
        ok: true,
        payload: {
          overallOk: true,
          results: [{ profile: 'desktop', ok: true, resolvedVersion: '1.5.1' }],
          autoRestartSkipped: true,
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.installButton)).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText(zh.packagePlaceholder), { target: { value: 'dshmarket' } })
    fireEvent.click(screen.getByText(zh.installButton))
    await waitFor(() => expect(screen.getByText(zh.autoRestartSkipped)).toBeTruthy())
  })

  it('disables the auto-restart checkbox and explains why when restart is unavailable', async () => {
    stubFetch({
      status: makeStatus({
        restart: { available: false, restarting: false, hint: 'restart from the terminal' },
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(/本主机重启不可用/)).toBeTruthy())
    const input = screen.getByText(zh.autoRestartCheck).closest('label')?.querySelector('input') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('explains that auto-restart only applies in single mode while dual targets are active', async () => {
    stubFetch({
      status: makeStatus({
        profiles: [
          { name: 'web', dir: 'C:\\Users\\me\\.dsh\\profiles\\web', current: true },
          { name: 'desktop', dir: 'C:\\Users\\me\\.dsh\\profiles\\desktop', current: false },
        ],
        desktop: { detected: true, reason: 'profile', profile: 'desktop' },
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.autoRestartSingleOnly)).toBeTruthy())
  })

  it('renders the desktop selection in the profile card', async () => {
    stubFetch({
      status: makeStatus({
        profileName: 'web',
        desktopSelection: { active: 'desktop', lastKnownGood: 'web' },
      }),
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getAllByText(/desktop/).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/回退: web/).length).toBeGreaterThan(0)
    expect(screen.getByText(zh.desktopNextBoot)).toBeTruthy()
  })
})

describe('Panel · payload drift regression', () => {
  it('survives a boot-report whose entries is NOT an array (live host shape)', async () => {
    stubFetch({
      bootReport: { ok: true, payload: { bootedAt: '2026-08-16T08:29:08.996Z', entries: {} } },
      audit: { ok: true, payload: { total: 0, entries: {} } },
      health: { ok: true, payload: { profile: 'web', ok: true, nextBundles: {}, issues: {} } },
      updates: { ok: true, payload: { profile: 'web', updatedAt: '', updates: {}, warnings: {} } },
      diff: { ok: true, payload: { profiles: {}, onlyInA: {}, onlyInB: {}, versionDiffers: {} } },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText('dshmarket')).toBeTruthy())
    expect(screen.getByText(zh.bootReportCard)).toBeTruthy()
    expect(screen.getByText(zh.auditCard)).toBeTruthy()
    expect(screen.getByText(zh.healthCard)).toBeTruthy()
    expect(screen.getByText(zh.updatesCard)).toBeTruthy()
    expect(screen.getByText(zh.compareCard)).toBeTruthy()
    // every card renders; none of them took the panel down
    expect(screen.queryByText('card render failed')).toBeNull()
  })
})

describe('Panel · F17 market search + jump receive side', () => {
  it('searches the market and carries a hit into the install fields', async () => {
    const fn = stubFetch({
      market: {
        ok: true,
        payload: {
          ok: true,
          source: 'snapshot',
          updated: '2026-08-15',
          total: 1,
          query: 'tts',
          results: [{
            name: 'dsh-plugin-tts',
            owner: 'owner',
            url: 'https://github.com/owner/dsh-plugin-tts',
            category: null,
            description: '文本转语音插件',
            npm: null,
            stars: 12,
            added: '2026-01-01',
            kind: 'github',
            installTarget: 'github:owner/dsh-plugin-tts',
          }],
        },
      },
    })
    render(h(Panel, { t }))
    await waitFor(() => expect(screen.getByText(zh.installButton)).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText(zh.marketSearchPlaceholder), { target: { value: 'tts' } })
    await waitFor(() => expect(screen.getByText('dsh-plugin-tts')).toBeTruthy(), { timeout: 3000 })
    expect(screen.getByText('★ 12')).toBeTruthy()
    expect(screen.getByText('文本转语音插件')).toBeTruthy()
    expect(screen.getByText(zh.marketGitBadge)).toBeTruthy()
    expect(screen.getByText(new RegExp(zh.marketSnapshot))).toBeTruthy()
    fireEvent.click(screen.getAllByText(zh.marketFill)[0] as HTMLElement)
    await waitFor(() => {
      expect((screen.getByPlaceholderText(zh.packagePlaceholder) as HTMLInputElement).value)
        .toBe('github:owner/dsh-plugin-tts')
    })
    // The version field is disabled for github targets.
    expect((screen.getByPlaceholderText(zh.githubTargetHint) as HTMLInputElement).disabled).toBe(true)
    // Filling the hit auto-ran the install preview.
    await waitFor(() => {
      const previewCall = fn.mock.calls.find(call => String(call[0]).includes('/install-preview')
        && JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')).package === 'github:owner/dsh-plugin-tts')
      expect(previewCall).toBeDefined()
    })
  })

  it('pre-fills and previews a parked market deep-link target on mount', async () => {
    const dispose = installMarketBridge()
    try {
      window.dispatchEvent(new CustomEvent(INSTALL_TARGET_EVENT, {
        detail: { package: 'github:owner/dsh-plugin-tts' },
      }))
      stubFetch({
        preview: {
          ok: true,
          payload: {
            ok: true,
            package: 'github:owner/dsh-plugin-tts',
            spec: null,
            source: 'github',
            latest: null,
            publishedAt: null,
            releaseAgeDays: null,
            minimumReleaseAgeDays: 7,
            warnings: [{ code: 'github-source', message: '来自 GitHub 仓库' }],
            suggestedPin: null,
          },
        },
      })
      render(h(Panel, { t }))
      await waitFor(() => {
        expect((screen.getByPlaceholderText(zh.packagePlaceholder) as HTMLInputElement).value)
          .toBe('github:owner/dsh-plugin-tts')
      })
      await waitFor(() => expect(screen.getByText('来自 GitHub 仓库')).toBeTruthy())
    } finally {
      dispose()
    }
  })

  it('parks a hash deep link target when the panel mounts later', async () => {
    const dispose = installMarketBridge()
    try {
      window.history.replaceState(null, '', '#dshpp-install=github%3Aowner%2Fdsh-plugin-tts')
      // The bridge reads the hash once at install time — reinstall for the test.
      dispose()
      const second = installMarketBridge()
      try {
        stubFetch()
        render(h(Panel, { t }))
        await waitFor(() => {
          expect((screen.getByPlaceholderText(zh.packagePlaceholder) as HTMLInputElement).value)
            .toBe('github:owner/dsh-plugin-tts')
        })
      } finally {
        second()
      }
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })
})
