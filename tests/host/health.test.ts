import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { collectHealth, satisfiesRange } from '../../src/health.ts'

const roots: string[] = []

function fixture(label: string, manifest: Record<string, unknown>): string {
  const dir = join(process.cwd(), 'tests', 'tmp', `health-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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

describe('satisfiesRange', () => {
  it('covers exact, caret, tilde, comparison, and wildcard shapes', () => {
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true)
    expect(satisfiesRange('1.2.2', '1.2.3')).toBe(false)
    expect(satisfiesRange('1.5.1', '^1.0.0')).toBe(true)
    expect(satisfiesRange('2.0.0', '^1.0.0')).toBe(false)
    expect(satisfiesRange('1.2.9', '~1.2.0')).toBe(true)
    expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false)
    expect(satisfiesRange('2.0.0', '>=1.0.0')).toBe(true)
    expect(satisfiesRange('0.9.0', '>=1.0.0')).toBe(false)
    expect(satisfiesRange('1.0.0', '*')).toBe(true)
    expect(satisfiesRange(null, '*')).toBe(false)
  })
})

describe('collectHealth (F6)', () => {
  it('reports a broken manifest', () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `health-broken-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), 'not json')
    roots.push(dir)
    const payload = collectHealth(dir, 'web')
    expect(payload.ok).toBe(false)
    expect(payload.issues).toEqual([{ severity: 'error', code: 'manifest-broken', message: expect.stringContaining('not valid JSON') }])
  })

  it('flags duplicates, orphans, and missing packages', () => {
    const dir = fixture('mixed', {
      name: 'p',
      dependencies: { bundled: '1.0.0', gone: '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'bundled', 'bundled', 'leftover'] } },
    })
    writePkg(dir, 'bundled', { version: '1.0.0', dsh: { bundle: { patch: './x.yml' } } })
    const payload = collectHealth(dir, 'web')
    const codes = payload.issues.map(issue => issue.code)
    expect(codes).toContain('duplicate-bundle')
    expect(codes).toContain('orphan-bundle')
    expect(codes).toContain('missing-package')
    expect(payload.issues.some(issue => issue.code === 'missing-package' && issue.bundle === 'gone')).toBe(true)
    expect(payload.issues.some(issue => issue.code === 'orphan-bundle' && issue.bundle === 'leftover')).toBe(true)
  })

  it('detects unsatisfied peer dependencies', () => {
    const dir = fixture('peers', {
      name: 'p',
      dependencies: { bundled: '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })
    writePkg(dir, 'bundled', {
      version: '1.0.0',
      dsh: { bundle: { patch: './x.yml' } },
      peerDependencies: { peer: '^1.0.0' },
    })
    const payload = collectHealth(dir, 'web')
    expect(payload.issues.some(issue => issue.code === 'peer-gap' && issue.bundle === 'bundled')).toBe(true)
    // Installing a satisfying peer clears the gap.
    writePkg(dir, 'peer', { version: '1.2.0' })
    const after = collectHealth(dir, 'web')
    expect(after.issues.some(issue => issue.code === 'peer-gap')).toBe(false)
  })

  it('never reports host-provided @deepseek-ai peers as gaps', () => {
    const dir = fixture('hostpeer', {
      name: 'p',
      dependencies: { bundled: '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })
    writePkg(dir, 'bundled', {
      version: '1.0.0',
      dsh: { bundle: { patch: './x.yml' } },
      peerDependencies: {
        '@deepseek-ai/cordis': '^4.0.1',
        '@deepseek-ai/schemastery': '^3.18.1',
      },
    })
    const payload = collectHealth(dir, 'web')
    expect(payload.issues.some(issue => issue.code === 'peer-gap')).toBe(false)
  })

  it('finds peers inside the pnpm virtual store', () => {
    const dir = fixture('pnpmpeer', {
      name: 'p',
      dependencies: { bundled: '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })
    writePkg(dir, 'bundled', {
      version: '1.0.0',
      dsh: { bundle: { patch: './x.yml' } },
      peerDependencies: { peer: '^1.0.0' },
    })
    const base = join(dir, 'node_modules', '.pnpm', 'peer@1.2.0', 'node_modules', 'peer')
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'package.json'), JSON.stringify({ name: 'peer', version: '1.2.0' }))
    const payload = collectHealth(dir, 'web')
    expect(payload.issues.some(issue => issue.code === 'peer-gap')).toBe(false)
  })

  it('previews the next bundles without writing the manifest', () => {
    const dir = fixture('dryrun', {
      name: 'p',
      dependencies: { bundled: '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })
    writePkg(dir, 'bundled', { version: '1.0.0', dsh: { bundle: { patch: './x.yml' } } })
    const before = readFileSync(join(dir, 'package.json'), 'utf8')
    const payload = collectHealth(dir, 'web')
    expect(payload.nextBundles).toEqual(['@deepseek-ai/dsh-base', 'bundled'])
    // Dry-run: the on-disk manifest is untouched.
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
  })

  it('is healthy for a clean profile', () => {
    const dir = fixture('clean', {
      name: 'p',
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    })
    const payload = collectHealth(dir, 'web')
    expect(payload.ok).toBe(true)
    expect(payload.issues).toEqual([])
  })
})

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})
