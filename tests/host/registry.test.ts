import { describe, expect, it, vi } from 'vitest'
import {
  buildGithubPreview,
  buildInstallPreview,
  createRegistryCache,
  queryRegistry,
  releaseAgeDays,
  type PnpmViewRun,
  type PnpmViewRunner,
  type RegistryView,
} from '../../src/registry.ts'

function fakeRunner(runs: Record<string, PnpmViewRun>): PnpmViewRunner {
  return async (args: string[]) => {
    const key = args.join(' ')
    const run = runs[key]
    if (run === undefined) {
      return { exitCode: 1, stdout: '', stderr: `no fake run for: ${key}` }
    }
    return run
  }
}

describe('queryRegistry', () => {
  it('reads the latest dist-tag and its publish time', async () => {
    const runner = fakeRunner({
      'view dshmarket version': { exitCode: 0, stdout: '1.5.1\n', stderr: '' },
      'view dshmarket time --json': {
        exitCode: 0,
        stdout: JSON.stringify({ created: '2025-01-01T00:00:00Z', '1.5.1': '2025-06-01T00:00:00Z' }),
        stderr: '',
      },
    })
    const view = await queryRegistry('dshmarket', runner)
    expect(view).toEqual({
      ok: true,
      package: 'dshmarket',
      latest: '1.5.1',
      publishedAt: '2025-06-01T00:00:00Z',
      timeMap: { created: '2025-01-01T00:00:00Z', '1.5.1': '2025-06-01T00:00:00Z' },
    })
  })

  it('falls back to created when the latest version has no time entry', async () => {
    const runner = fakeRunner({
      'view pkg version': { exitCode: 0, stdout: '2.0.0\n', stderr: '' },
      'view pkg time --json': {
        exitCode: 0,
        stdout: JSON.stringify({ created: '2025-03-01T00:00:00Z' }),
        stderr: '',
      },
    })
    const view = await queryRegistry('pkg', runner)
    expect(view.ok).toBe(true)
    if (view.ok) expect(view.publishedAt).toBe('2025-03-01T00:00:00Z')
  })

  it('degrades to a not-found failure without throwing', async () => {
    const runner = fakeRunner({})
    const view = await queryRegistry('missing-pkg', runner)
    expect(view.ok).toBe(false)
    if (!view.ok) {
      expect(view.code).toBe('not-found')
      expect(view.package).toBe('missing-pkg')
    }
  })

  it('marks a missing pnpm binary as a network failure', async () => {
    const runner: PnpmViewRunner = async () => ({ exitCode: 127, stdout: '', stderr: 'pnpm not found on PATH', missing: true })
    const view = await queryRegistry('pkg', runner)
    expect(view.ok).toBe(false)
    if (!view.ok) expect(view.code).toBe('network')
  })

  it('survives a malformed time payload', async () => {
    const runner = fakeRunner({
      'view pkg version': { exitCode: 0, stdout: '1.0.0\n', stderr: '' },
      'view pkg time --json': { exitCode: 0, stdout: 'not json', stderr: '' },
    })
    const view = await queryRegistry('pkg', runner)
    expect(view.ok).toBe(true)
    if (view.ok) expect(view.publishedAt).toBeNull()
  })
})

describe('releaseAgeDays', () => {
  it('computes whole-day ages and tolerates garbage', () => {
    const now = Date.parse('2025-06-13T00:00:00Z')
    expect(releaseAgeDays('2025-06-01T00:00:00Z', now)).toBe(12)
    expect(releaseAgeDays('2025-06-13T00:00:00Z', now)).toBe(0)
    expect(releaseAgeDays(null, now)).toBeNull()
    expect(releaseAgeDays('garbage', now)).toBeNull()
  })
})

describe('buildInstallPreview', () => {
  const okView: RegistryView = {
    ok: true,
    package: 'dshmarket',
    latest: '1.5.1',
    publishedAt: '2025-06-01T00:00:00Z',
    timeMap: { '1.5.1': '2025-06-01T00:00:00Z' },
  }

  it('warns when the latest release is younger than the policy threshold', () => {
    const preview = buildInstallPreview({
      view: okView,
      packageName: 'dshmarket',
      spec: null,
      minimumReleaseAgeDays: 30,
      now: Date.parse('2025-06-13T00:00:00Z'),
    })
    expect(preview.ok).toBe(true)
    expect(preview.releaseAgeDays).toBe(12)
    expect(preview.warnings).toHaveLength(1)
    expect(preview.warnings[0]?.code).toBe('release-age')
    expect(preview.suggestedPin).toBe('1.5.1')
  })

  it('stays quiet when the release is old enough', () => {
    const preview = buildInstallPreview({
      view: okView,
      packageName: 'dshmarket',
      minimumReleaseAgeDays: 7,
      now: Date.parse('2025-06-13T00:00:00Z'),
    })
    expect(preview.warnings).toEqual([])
  })

  it('suggests a pin only for non-exact specs', () => {
    const ranged = buildInstallPreview({
      view: okView,
      packageName: 'dshmarket',
      spec: '^1.0.0',
      minimumReleaseAgeDays: 7,
      now: Date.parse('2025-06-13T00:00:00Z'),
    })
    expect(ranged.suggestedPin).toBe('1.5.1')
    const exact = buildInstallPreview({
      view: okView,
      packageName: 'dshmarket',
      spec: '1.5.1',
      minimumReleaseAgeDays: 7,
      now: Date.parse('2025-06-13T00:00:00Z'),
    })
    expect(exact.suggestedPin).toBeNull()
  })

  it('turns a registry failure into a warning payload', () => {
    const preview = buildInstallPreview({
      view: { ok: false, package: 'dshmarket', code: 'network', message: 'offline' },
      packageName: 'dshmarket',
      minimumReleaseAgeDays: 7,
    })
    expect(preview.ok).toBe(false)
    expect(preview.warnings).toEqual([{ code: 'network', message: 'offline' }])
  })
})

describe('buildGithubPreview', () => {
  it('describes a repo target without registry data', () => {
    const preview = buildGithubPreview('github:owner/repo', 7)
    expect(preview.ok).toBe(true)
    expect(preview.source).toBe('github')
    expect(preview.spec).toBeNull()
    expect(preview.latest).toBeNull()
    expect(preview.suggestedPin).toBeNull()
    expect(preview.warnings).toEqual([{
      code: 'github-source',
      message: '该插件来自 GitHub 仓库，将跟随仓库 HEAD 安装（无版本号可预览）',
    }])
  })
})

describe('createRegistryCache', () => {
  it('serves from cache within TTL and re-queries after', async () => {
    vi.useFakeTimers()
    try {
      const viewer = vi.fn(async (): Promise<RegistryView> => ({
        ok: true,
        package: 'pkg',
        latest: '1.0.0',
        publishedAt: '2025-01-01T00:00:00Z',
        timeMap: {},
      }))
      const cached = createRegistryCache(viewer, 300_000)
      await cached('pkg')
      await cached('pkg')
      expect(viewer).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(301_000)
      await cached('pkg')
      expect(viewer).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not cache failures', async () => {
    const viewer = vi.fn(async (): Promise<RegistryView> => ({ ok: false, package: 'pkg', code: 'network', message: 'x' }))
    const cached = createRegistryCache(viewer, 300_000)
    await cached('pkg')
    await cached('pkg')
    expect(viewer).toHaveBeenCalledTimes(2)
  })
})
