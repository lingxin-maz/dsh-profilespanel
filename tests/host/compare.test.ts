import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { attributeBundle, attributeBundles, isHotReloadable } from '../../src/attribution.ts'
import { diffProfiles } from '../../src/compare.ts'

const roots: string[] = []

function fixture(label: string, manifest: Record<string, unknown>): string {
  const dir = join(process.cwd(), 'tests', 'tmp', `cmp-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  roots.push(dir)
  return dir
}

function writePkg(dir: string, name: string, manifest: Record<string, unknown>): void {
  const base = join(dir, 'node_modules', name)
  mkdirSync(base, { recursive: true })
  writeFileSync(join(base, 'package.json'), JSON.stringify({ name, ...manifest }))
}

describe('attributeBundle / attributeBundles (F8)', () => {
  it('classifies inbox, dependency, and patch sources with layer indexes', () => {
    const dir = fixture('attr', {
      name: 'p',
      dependencies: { dshmarket: '1.5.1' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dshmarket'] } },
    })
    writePkg(dir, 'dshmarket', { version: '1.5.1', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    const rows = attributeBundles(dir)
    expect(rows).toEqual([
      { name: '@deepseek-ai/dsh-base', source: 'inbox', layerIndex: 0, hotReloadable: false },
      {
        name: 'dshmarket',
        source: 'dependency',
        layerIndex: 1,
        introducedBy: 'dshmarket@1.5.1',
        hotReloadable: false,
      },
    ])
  })

  it('marks a bundle declared outside dependencies as patch-only', () => {
    const dir = fixture('patch', {
      name: 'p',
      dependencies: {},
      dsh: { profile: { bundles: ['mystery'] } },
    })
    writePkg(dir, 'mystery', { version: '1.0.0', dsh: { bundle: { patch: './x.yml' } } })
    expect(attributeBundle({ name: 'mystery', index: 0, dependencies: {}, profileDir: dir }))
      .toEqual({ source: 'patch', layerIndex: 0, hotReloadable: false })
  })

  it('probes the HMR capability from dsh.hot and hmr dependencies', () => {
    const dir = fixture('hot', { name: 'p', dependencies: {} })
    writePkg(dir, 'via-flag', { version: '1.0.0', dsh: { hot: true } })
    writePkg(dir, 'via-dep', { version: '1.0.0', dependencies: { 'cordis-plugin-hmr': '^1.0.0' } })
    writePkg(dir, 'plain', { version: '1.0.0' })
    expect(isHotReloadable(dir, 'via-flag')).toBe(true)
    expect(isHotReloadable(dir, 'via-dep')).toBe(true)
    expect(isHotReloadable(dir, 'plain')).toBe(false)
    expect(isHotReloadable(dir, 'missing')).toBe(false)
  })
})

describe('diffProfiles (F7)', () => {
  it('reports only-in sides and version drift', () => {
    const dirA = fixture('a', { name: 'a', dependencies: { both: '1.2.2', onlya: '1.0.0' } })
    const dirB = fixture('b', { name: 'b', dependencies: { both: '1.5.1', onlyb: '1.0.0' } })
    for (const [dir, name] of [[dirA, 'both'], [dirA, 'onlya'], [dirB, 'both'], [dirB, 'onlyb']] as const) {
      writePkg(dir, name, { version: name === 'both' ? (dir === dirA ? '1.2.2' : '1.5.1') : '1.0.0', dsh: { bundle: { patch: './x.yml' } } })
    }
    const diff = diffProfiles({ a: { name: 'a', dir: dirA }, b: { name: 'b', dir: dirB } })
    expect(diff.profiles).toEqual(['a', 'b'])
    expect(diff.onlyInA).toEqual(['onlya'])
    expect(diff.onlyInB).toEqual(['onlyb'])
    expect(diff.versionDiffers).toEqual([{ bundle: 'both', a: '1.2.2', b: '1.5.1' }])
  })

  it('is empty for identical profiles', () => {
    const dirA = fixture('same-a', { name: 'a', dependencies: { both: '1.0.0' } })
    const dirB = fixture('same-b', { name: 'b', dependencies: { both: '1.0.0' } })
    writePkg(dirA, 'both', { version: '1.0.0', dsh: { bundle: { patch: './x.yml' } } })
    writePkg(dirB, 'both', { version: '1.0.0', dsh: { bundle: { patch: './x.yml' } } })
    const diff = diffProfiles({ a: { name: 'a', dir: dirA }, b: { name: 'b', dir: dirB } })
    expect(diff.onlyInA).toEqual([])
    expect(diff.onlyInB).toEqual([])
    expect(diff.versionDiffers).toEqual([])
  })
})

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})
