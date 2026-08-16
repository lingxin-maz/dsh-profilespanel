import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  alignAcrossProfiles,
  collectUpdates,
  isNonRegistrySpec,
  listBundleDependencies,
  updateIntoProfiles,
} from '../../src/updates.ts'
import { readProfileManifest, writeProfileManifest } from '../../src/profile.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { RegistryView } from '../../src/registry.ts'

const roots: string[] = []

function fixture(label: string, deps: Record<string, string>): string {
  const dir = join(process.cwd(), 'tests', 'tmp', `updates-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `dsh-profile-${label}`,
    dependencies: deps,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }))
  roots.push(dir)
  return dir
}

function writeBundlePkg(dir: string, name: string, version: string, withPatch = true): void {
  const base = join(dir, 'node_modules', name)
  mkdirSync(base, { recursive: true })
  writeFileSync(join(base, 'package.json'), JSON.stringify({
    name,
    version,
    ...(withPatch ? { dsh: { bundle: { patch: './cordis.patch.yml' } } } : {}),
  }))
}

const okView = (latest: string, publishedAt: string): RegistryView => ({
  ok: true,
  package: 'x',
  latest,
  publishedAt,
  timeMap: {},
})

describe('listBundleDependencies', () => {
  it('lists only dependencies that declare dsh.bundle.patch', () => {
    const dir = fixture('list', { bundled: '1.0.0', plain: '1.0.0' })
    writeBundlePkg(dir, 'bundled', '1.0.0')
    writeBundlePkg(dir, 'plain', '1.0.0', false)
    expect(listBundleDependencies(dir)).toEqual(['bundled'])
  })
})

describe('isNonRegistrySpec', () => {
  it('recognizes github and local install specs', () => {
    expect(isNonRegistrySpec('github:owner/repo#abc')).toBe(true)
    expect(isNonRegistrySpec('github:owner/repo#path:/sub')).toBe(true)
    expect(isNonRegistrySpec('link:../local')).toBe(true)
    expect(isNonRegistrySpec('file:../local')).toBe(true)
    expect(isNonRegistrySpec('^1.0.0')).toBe(false)
    expect(isNonRegistrySpec('1.5.1')).toBe(false)
  })
})

describe('collectUpdates', () => {
  it('flags outdated bundles and skips current ones', async () => {
    const dir = fixture('collect', { bundled: '1.2.2' })
    writeBundlePkg(dir, 'bundled', '1.2.2')
    const payload = await collectUpdates({
      profileDir: dir,
      profileName: 'web',
      registryView: async () => okView('1.5.1', '2025-06-01T00:00:00Z'),
    })
    expect(payload.profile).toBe('web')
    expect(payload.updates).toEqual([{
      bundle: 'bundled',
      installed: '1.2.2',
      latest: '1.5.1',
      outdated: true,
      releaseAgeDays: expect.any(Number),
    }])
  })

  it('collects registry failures as warnings without dropping the feed', async () => {
    const dir = fixture('warn', { bundled: '1.0.0' })
    writeBundlePkg(dir, 'bundled', '1.0.0')
    const payload = await collectUpdates({
      profileDir: dir,
      profileName: 'web',
      registryView: async () => ({ ok: false, package: 'bundled', code: 'network', message: 'offline' }),
    })
    expect(payload.updates).toEqual([])
    expect(payload.warnings).toEqual([{ code: 'network', message: 'bundled: offline' }])
  })

  it('reports github-installed bundles without querying the registry', async () => {
    const dir = fixture('gh', { 'dsh-plugin-tts': 'github:owner/dsh-plugin-tts#abc1234' })
    writeBundlePkg(dir, 'dsh-plugin-tts', '2.3.4')
    const registryView = vi.fn(async (): Promise<RegistryView> => okView('9.9.9', '2025-01-01T00:00:00Z'))
    const payload = await collectUpdates({
      profileDir: dir,
      profileName: 'web',
      registryView,
    })
    expect(registryView).not.toHaveBeenCalled()
    expect(payload.updates).toEqual([{
      bundle: 'dsh-plugin-tts',
      installed: 'github:owner/dsh-plugin-tts#abc1234',
      latest: null,
      outdated: false,
      releaseAgeDays: null,
    }])
    expect(payload.warnings).toEqual([{
      code: 'non-registry',
      message: 'dsh-plugin-tts: 非 registry 安装（GitHub），跳过版本检查',
    }])
  })
})

describe('updateIntoProfiles', () => {
  it('reuses the install executor with an explicit version', async () => {
    const dir = fixture('update', { bundled: '1.2.2' })
    writeBundlePkg(dir, 'bundled', '1.5.1')
    const ctx = {
      get: (name: string) => (name === 'desktopProfiles'
        ? { current: { name: 'web' }, list: () => [{ name: 'web', dir, webCapable: true }] }
        : undefined),
    } as unknown as Context
    const executor = {
      add: async (target: string, profileDir: string) => {
        const manifest = readProfileManifest(profileDir)
        manifest.dependencies = { ...(manifest.dependencies ?? {}), bundled: target.split('@')[1] ?? '1.5.1' }
        writeProfileManifest(profileDir, manifest)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const outcome = await updateIntoProfiles({
      request: { package: 'bundled', spec: '1.5.1' },
      ctx,
      currentName: 'web',
      executor,
    })
    expect(outcome.results[0]?.ok).toBe(true)
    expect(outcome.results[0]?.resolvedVersion).toBe('1.5.1')
  })
})

describe('alignAcrossProfiles', () => {
  it('defaults the version to the registry latest and aligns every profile', async () => {
    const dirA = fixture('align-a', { bundled: '1.0.0' })
    const dirB = fixture('align-b', { bundled: '1.0.0' })
    for (const dir of [dirA, dirB]) writeBundlePkg(dir, 'bundled', '1.0.0')
    const ctx = {
      get: (name: string) => (name === 'desktopProfiles'
        ? {
          current: { name: 'a' },
          list: () => [{ name: 'a', dir: dirA, webCapable: true }, { name: 'b', dir: dirB, webCapable: true }],
        }
        : undefined),
    } as unknown as Context
    const executor = {
      add: async (target: string, profileDir: string) => {
        const manifest = readProfileManifest(profileDir)
        manifest.dependencies = { ...(manifest.dependencies ?? {}), bundled: target.split('@')[1] ?? '1.5.1' }
        writeProfileManifest(profileDir, manifest)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const outcome = await alignAcrossProfiles({
      request: { package: 'bundled', profiles: ['a', 'b'] },
      ctx,
      currentName: 'a',
      registryView: async () => okView('1.5.1', '2025-06-01T00:00:00Z'),
      executor,
    })
    if ('error' in outcome) throw new Error(outcome.error)
    expect(outcome.overallOk).toBe(true)
    expect(outcome.results).toHaveLength(2)
    expect(outcome.results[0]?.requestedVersion).toBe('1.5.1')
  })

  it('surfaces a registry failure as a typed error', async () => {
    const dir = fixture('align-fail', { bundled: '1.0.0' })
    const ctx = {
      get: (name: string) => (name === 'desktopProfiles'
        ? { current: { name: 'a' }, list: () => [{ name: 'a', dir, webCapable: true }] }
        : undefined),
    } as unknown as Context
    const outcome = await alignAcrossProfiles({
      request: { package: 'bundled', profiles: ['a'] },
      ctx,
      currentName: 'a',
      registryView: async () => ({ ok: false, package: 'bundled', code: 'network', message: 'offline' }),
    })
    expect('error' in outcome).toBe(true)
    if ('error' in outcome) expect(outcome.error).toContain('cannot resolve the latest version')
  })
})

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})
