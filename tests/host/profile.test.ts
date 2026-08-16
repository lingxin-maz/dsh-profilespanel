import { afterAll, describe, expect, it } from 'vitest'
import {
  computeChanges,
  discoverProfiles,
  manifestBundles,
  manifestDeps,
  readProfileManifest,
  resolveProfile,
  snapshotProfile,
  statTrackedFile,
  webCapableFromBundles,
  writeProfileManifest,
  type BootSnapshot,
} from '../../src/profile.ts'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

describe('resolveProfile', () => {
  it('prefers the desktop launcher service over argv and config', () => {
    const resolved = resolveProfile({
      configured: 'custom',
      argv: ['node', 'dsh', '--profile', 'cli'],
      desktop: { name: 'desktop', dir: 'C:\\somewhere\\desktop' },
    })
    expect(resolved).toEqual({ name: 'desktop', dir: 'C:\\somewhere\\desktop', desktop: true })
  })

  it('falls back to --profile on the CLI invocation', () => {
    const resolved = resolveProfile({ argv: ['node', 'dsh', '--profile', 'cli'] })
    expect(resolved.name).toBe('cli')
    expect(resolved.desktop).toBe(false)
  })

  it('ignores a --profile flag without a value', () => {
    const resolved = resolveProfile({ argv: ['node', 'dsh', '--profile', '--patch'] })
    expect(resolved.name).toBe('web')
  })

  it('lets an explicit configuration override the argv fallback', () => {
    const resolved = resolveProfile({ configured: 'pinned', argv: ['node', 'dsh', '--profile', 'cli'] })
    expect(resolved.name).toBe('pinned')
  })

  it('defaults to web with no signals at all', () => {
    const resolved = resolveProfile({ argv: ['node', 'dsh'] })
    expect(resolved.name).toBe('web')
  })
})

describe('manifest helpers', () => {
  it('reads bundles and dependencies with empty defaults', () => {
    const dir = makeFixture('manifest-empty')
    writeProfileManifest(dir, { name: 'dsh-profile-x', private: true })
    const manifest = readProfileManifest(dir)
    expect(manifestBundles(manifest)).toEqual([])
    expect(manifestDeps(manifest)).toEqual({})
  })

  it('throws a descriptive error on a broken manifest', () => {
    const dir = makeFixture('manifest-broken')
    writeFileSync(join(dir, 'package.json'), '{ not json')
    expect(() => readProfileManifest(dir)).toThrow(/not valid JSON/)
  })
})

describe('computeChanges', () => {
  function makeBoot(dir: string): BootSnapshot {
    writeProfileManifest(dir, {
      name: 'dsh-profile-x',
      private: true,
      dependencies: { '@deepseek-ai/dsh-base': '^1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })
    const resolved = { name: 'test', dir, desktop: false }
    return snapshotProfile(resolved)
  }

  it('reports clean when the disk matches the snapshot', () => {
    const dir = makeFixture('changes-clean')
    const boot = makeBoot(dir)
    const disk = { bundles: [...boot.bundles], dependencies: { ...boot.dependencies }, files: new Map(boot.files) }
    expect(computeChanges(boot, disk)).toBeNull()
  })

  it('flags an added bundle as pending restart', () => {
    const dir = makeFixture('changes-added')
    const boot = makeBoot(dir)
    const manifest = readProfileManifest(dir)
    manifest.dsh = { profile: { bundles: [...boot.bundles, 'dshmarket'] } }
    manifest.dependencies = { ...manifest.dependencies, dshmarket: '1.5.1' }
    writeProfileManifest(dir, manifest)
    const changes = computeChanges(boot, {
      bundles: [...boot.bundles, 'dshmarket'],
      dependencies: manifest.dependencies ?? {},
      files: new Map(boot.files),
    })
    expect(changes).not.toBeNull()
    expect(changes?.addedBundles).toEqual(['dshmarket'])
    expect(changes?.removedBundles).toEqual([])
  })

  it('flags a removed bundle', () => {
    const dir = makeFixture('changes-removed')
    const boot = makeBoot(dir)
    const changes = computeChanges(boot, {
      bundles: [],
      dependencies: { '@deepseek-ai/dsh-base': '^1.0.0' },
      files: new Map(boot.files),
    })
    expect(changes?.removedBundles).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('flags a lockfile stamp change even without a manifest diff', () => {
    const dir = makeFixture('changes-lock')
    const boot = makeBoot(dir)
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfile: v9\n', 'utf8')
    const files = new Map(boot.files)
    files.set('pnpm-lock.yaml', { mtimeMs: (files.get('pnpm-lock.yaml')?.mtimeMs ?? 0) + 1000, size: 9999 })
    const changes = computeChanges(boot, {
      bundles: [...boot.bundles],
      dependencies: { ...boot.dependencies },
      files,
    })
    expect(changes).not.toBeNull()
    expect(changes?.changedFiles).toContain('pnpm-lock.yaml')
  })

  it('ignores a package.json rewrite without semantic change', () => {
    const dir = makeFixture('changes-cosmetic')
    const boot = makeBoot(dir)
    const files = new Map(boot.files)
    files.set('package.json', { mtimeMs: (files.get('package.json')?.mtimeMs ?? 0) + 1000, size: 9999 })
    const changes = computeChanges(boot, {
      bundles: [...boot.bundles],
      dependencies: { ...boot.dependencies },
      files,
    })
    expect(changes).toBeNull()
  })
})

describe('discoverProfiles + capability', () => {
  it('scans profile directories and skips node_modules and broken manifests', () => {
    const home = makeFixture('scan-home')
    const root = join(home, 'profiles')
    mkdirSync(join(root, 'web'), { recursive: true })
    mkdirSync(join(root, 'broken'), { recursive: true })
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    writeProfileManifest(join(root, 'web'), {
      name: 'dsh-profile-web',
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    })
    writeFileSync(join(root, 'broken', 'package.json'), '{')
    const found = discoverProfiles(home)
    expect(found.map(profile => profile.name)).toEqual(['web'])
    expect(found[0]?.webCapable).toBe(true)
  })
})

describe('webCapableFromBundles', () => {
  it('requires the base bundle before the web bundle', () => {
    expect(webCapableFromBundles(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])).toBe(true)
    expect(webCapableFromBundles(['@deepseek-ai/dsh-web-app'])).toBe(false)
    expect(webCapableFromBundles(['@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-base'])).toBe(false)
  })
})

describe('statTrackedFile', () => {
  it('returns null for missing files', () => {
    const dir = makeFixture('stat-missing')
    expect(statTrackedFile(dir, 'pnpm-lock.yaml')).toBeNull()
  })
})

const fixtureRoots: string[] = []

function makeFixture(label: string): string {
  const root = join(process.cwd(), 'tests', 'tmp', `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(root, { recursive: true })
  fixtureRoots.push(root)
  return root
}

afterAll(() => {
  for (const root of fixtureRoots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})
