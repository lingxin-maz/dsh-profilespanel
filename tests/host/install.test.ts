import { afterAll, describe, expect, it } from 'vitest'
import {
  findUndoSnapshots,
  installIntoProfiles,
  isExactSpec,
  reconcileBundles,
  saveUndoSnapshot,
  semverCompare,
  undoProfile,
  validateInstallTarget,
} from '../../src/install.ts'
import {
  readProfileManifest,
  manifestBundles,
  writeProfileManifest,
} from '../../src/profile.ts'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/** Simulates pnpm add: writes the dependency into the profile manifest. */
function pnpmWritesDep(target: string, profileDir: string): void {
  const manifest = readProfileManifest(profileDir)
  const name = target.split('@')[0] ?? target
  const spec = target.includes('@') ? target.slice(target.indexOf('@') + 1) : '^1.0.0'
  manifest.dependencies = { ...(manifest.dependencies ?? {}), [name]: spec }
  writeProfileManifest(profileDir, manifest)
}

describe('validateInstallTarget', () => {
  it('accepts plain and scoped registry packages', () => {
    expect(validateInstallTarget('dshmarket', undefined)).toEqual({ target: 'dshmarket', package: 'dshmarket', kind: 'npm' })
    expect(validateInstallTarget('@scope/pkg', undefined)).toEqual({ target: '@scope/pkg', package: '@scope/pkg', kind: 'npm' })
    expect(validateInstallTarget('dshmarket', '1.5.1')).toEqual({ target: 'dshmarket@1.5.1', package: 'dshmarket', kind: 'npm' })
    expect(validateInstallTarget('dshmarket', '^1.0.0')).toEqual({ target: 'dshmarket@^1.0.0', package: 'dshmarket', kind: 'npm' })
    expect(validateInstallTarget('dshmarket', 'latest')).toEqual({ target: 'dshmarket@latest', package: 'dshmarket', kind: 'npm' })
  })

  it('accepts github targets, with and without a monorepo subpath', () => {
    expect(validateInstallTarget('github:owner/repo', undefined)).toEqual({
      target: 'github:owner/repo', package: 'github:owner/repo', kind: 'github', repo: 'owner/repo', subpath: null,
    })
    expect(validateInstallTarget('github:owner/repo#path:/plugins/tts', undefined)).toEqual({
      target: 'github:owner/repo#path:/plugins/tts', package: 'github:owner/repo#path:/plugins/tts',
      kind: 'github', repo: 'owner/repo', subpath: 'plugins/tts',
    })
  })

  it('rejects github targets with a version spec or unsafe selectors', () => {
    expect(validateInstallTarget('github:owner/repo', '1.0.0')).toHaveProperty('error')
    expect(validateInstallTarget('github:owner/repo#path:../x', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('github:owner/repo#path:/a/../b', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('github:owner/repo#path:/', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('github:owner', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('github:owner/repo extra', undefined)).toHaveProperty('error')
  })

  it('rejects local paths, git urls, and injection attempts', () => {
    expect(validateInstallTarget('../evil', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('file:../../x', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('git+https://github.com/o/r.git', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('https://github.com/o/r', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('dshmarket', '../../x')).toHaveProperty('error')
    expect(validateInstallTarget('dshmarket', '1.0.0; rm -rf /')).toHaveProperty('error')
    expect(validateInstallTarget('dshmarket', '1.0.0 && evil')).toHaveProperty('error')
    expect(validateInstallTarget('dsh market', undefined)).toHaveProperty('error')
    expect(validateInstallTarget('dshmarket@evil/../../', undefined)).toHaveProperty('error')
  })
})

describe('isExactSpec + semverCompare', () => {
  it('recognizes exact version pins only', () => {
    expect(isExactSpec('1.5.1')).toBe(true)
    expect(isExactSpec('1.5.1-rc.1')).toBe(true)
    expect(isExactSpec('^1.0.0')).toBe(false)
    expect(isExactSpec('latest')).toBe(false)
    expect(isExactSpec(undefined)).toBe(false)
    expect(isExactSpec('')).toBe(false)
  })

  it('compares plain semver triples', () => {
    expect(semverCompare('1.5.1', '1.5.1')).toBe(0)
    expect(semverCompare('1.2.2', '1.5.1')).toBe(-1)
    expect(semverCompare('2.0.0', '1.9.9')).toBe(1)
    expect(semverCompare('v1.0.0', '1.0.0')).toBe(0)
  })
})

describe('reconcileBundles', () => {
  function fixture(label: string): string {
    const dir = join(process.cwd(), 'tests', 'tmp', `reconcile-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    roots.push(dir)
    return dir
  }

  function writePkg(dir: string, name: string, manifest: Record<string, unknown>): void {
    mkdirSync(join(dir, 'node_modules', name), { recursive: true })
    writeFileSync(join(dir, 'node_modules', name, 'package.json'), JSON.stringify(manifest))
  }

  it('appends a bundle-declaring dependency and leaves plain libraries out', () => {
    const dir = fixture('add')
    writeProfile(dir, { deps: { plain: '1.0.0', bundled: '2.0.0' }, bundles: ['@deepseek-ai/dsh-base'] })
    writePkg(dir, 'plain', { name: 'plain', version: '1.0.0' })
    writePkg(dir, 'bundled', { name: 'bundled', version: '2.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    const before = readProfileManifest(dir)
    const bundles = reconcileBundles(before, dir)
    expect(bundles).toEqual(['@deepseek-ai/dsh-base', 'bundled'])
    expect(manifestBundles(readProfileManifest(dir))).toEqual(['@deepseek-ai/dsh-base', 'bundled'])
  })

  it('drops a dependency-listed bundle whose declaration disappeared', () => {
    const dir = fixture('drop')
    writeProfile(dir, { deps: { bundled: '2.0.0' }, bundles: ['bundled'] })
    writePkg(dir, 'bundled', { name: 'bundled', version: '3.0.0' }) // no dsh.bundle anymore
    const before = readProfileManifest(dir)
    const bundles = reconcileBundles(before, dir)
    expect(bundles).toEqual([])
  })

  it('never touches in-box bundles that are not dependencies', () => {
    const dir = fixture('inbox')
    writeProfile(dir, { deps: {}, bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] })
    const before = readProfileManifest(dir)
    expect(reconcileBundles(before, dir)).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
  })
})

describe('installIntoProfiles', () => {
  function makeCtx(profiles: Array<{ name: string; dir: string }>): Context {
    return {
      get: (name: string) => (name === 'desktopProfiles'
        ? {
          current: { name: profiles[0]?.name ?? 'web' },
          list: () => profiles.map(profile => ({
            name: profile.name,
            dir: profile.dir,
            webCapable: true,
          })),
        }
        : undefined),
    } as unknown as Context
  }

  it('reports partial failure per profile without aborting the run', async () => {
    const dirA = join(process.cwd(), 'tests', 'tmp', `multi-a-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const dirB = join(process.cwd(), 'tests', 'tmp', `multi-b-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    for (const dir of [dirA, dirB]) {
      mkdirSync(join(dir, 'node_modules', 'dshmarket'), { recursive: true })
      writeFileSync(join(dir, 'node_modules', 'dshmarket', 'package.json'), JSON.stringify({
        name: 'dshmarket',
        version: '1.5.1',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-profile-x', dependencies: {} }))
      roots.push(dir)
    }
    const ctx = makeCtx([{ name: 'a', dir: dirA }, { name: 'b', dir: dirB }])
    const executor = {
      add: async (target: string, profileDir: string) => {
        if (profileDir === dirB) return { exitCode: 1, stdout: '', stderr: 'boom' }
        pnpmWritesDep(target, profileDir)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const outcome = await installIntoProfiles({
      request: { package: 'dshmarket', spec: '1.5.1', profiles: ['a', 'b'] },
      ctx,
      currentName: 'a',
      executor,
    })
    expect(outcome.overallOk).toBe(false)
    expect(outcome.results).toHaveLength(2)
    const okRow = outcome.results.find(row => row.profile === 'a')
    const badRow = outcome.results.find(row => row.profile === 'b')
    expect(okRow?.ok).toBe(true)
    expect(okRow?.resolvedVersion).toBe('1.5.1')
    expect(okRow?.downgraded).toBeUndefined()
    expect(badRow?.ok).toBe(false)
    expect(badRow?.error).toContain('boom')
  })

  it('flags a downgraded resolution for an exact spec', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `downgrade-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(dir, 'node_modules', 'dshmarket'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'dshmarket', 'package.json'), JSON.stringify({
      name: 'dshmarket',
      version: '1.2.2',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-profile-a', dependencies: {} }))
    roots.push(dir)
    const ctx = makeCtx([{ name: 'a', dir }])
    const executor = {
      add: async (target: string, profileDir: string) => {
        pnpmWritesDep(target, profileDir)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const outcome = await installIntoProfiles({
      request: { package: 'dshmarket', spec: '1.5.1', profiles: ['a'] },
      ctx,
      currentName: 'a',
      executor,
    })
    const row = outcome.results[0]
    expect(row?.ok).toBe(true)
    expect(row?.downgraded).toBe(true)
    expect(row?.resolvedVersion).toBe('1.2.2')
    expect(row?.requestedVersion).toBe('1.5.1')
  })

  it('installs a github target and reconciles the added bundle', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `gh-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    writeProfile(dir, { deps: {}, bundles: [] })
    roots.push(dir)
    const ctx = makeCtx([{ name: 'a', dir }])
    const executor = {
      add: async (target: string, profileDir: string) => {
        expect(target).toBe('github:owner/dsh-plugin-tts')
        // pnpm records the dependency under the repo's own package name.
        mkdirSync(join(profileDir, 'node_modules', 'dsh-plugin-tts'), { recursive: true })
        writeFileSync(join(profileDir, 'node_modules', 'dsh-plugin-tts', 'package.json'), JSON.stringify({
          name: 'dsh-plugin-tts',
          version: '2.3.4',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }))
        const manifest = readProfileManifest(profileDir)
        manifest.dependencies = { ...(manifest.dependencies ?? {}), 'dsh-plugin-tts': 'github:owner/dsh-plugin-tts#abc1234' }
        writeProfileManifest(profileDir, manifest)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const outcome = await installIntoProfiles({
      request: { package: 'github:owner/dsh-plugin-tts', profiles: ['a'] },
      ctx,
      currentName: 'a',
      executor,
    })
    expect(outcome.overallOk).toBe(true)
    const row = outcome.results[0]
    expect(row?.ok).toBe(true)
    expect(row?.installedAs).toEqual(['dsh-plugin-tts'])
    expect(row?.resolvedVersion).toBe('dsh-plugin-tts@2.3.4')
    expect(manifestBundles(readProfileManifest(dir))).toEqual(['dsh-plugin-tts'])
  })

  it('reports a github add that only re-pinned an existing dependency', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `ghpin-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    writeProfile(dir, { deps: { 'dsh-plugin-tts': 'github:owner/dsh-plugin-tts#old' }, bundles: ['dsh-plugin-tts'] })
    roots.push(dir)
    const ctx = makeCtx([{ name: 'a', dir }])
    const executor = {
      add: async (_target: string, profileDir: string) => {
        const manifest = readProfileManifest(profileDir)
        manifest.dependencies = { ...(manifest.dependencies ?? {}), 'dsh-plugin-tts': 'github:owner/dsh-plugin-tts#new' }
        writeProfileManifest(profileDir, manifest)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const outcome = await installIntoProfiles({
      request: { package: 'github:owner/dsh-plugin-tts', profiles: ['a'] },
      ctx,
      currentName: 'a',
      executor,
    })
    const row = outcome.results[0]
    expect(row?.ok).toBe(true)
    expect(row?.installedAs).toBeUndefined()
    expect(row?.resolvedVersion).toBeNull()
    expect(row?.downgraded).toBe(false)
  })

  it('defaults the target list to the current profile', async () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `default-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-profile-a', dependencies: {} }))
    roots.push(dir)
    const ctx = makeCtx([{ name: 'a', dir }])
    const calls: string[] = []
    const executor = {
      add: async (_target: string, profileDir: string) => {
        calls.push(profileDir)
        return { exitCode: 1, stdout: '', stderr: 'nope' }
      },
    }
    const outcome = await installIntoProfiles({
      request: { package: 'dshmarket' },
      ctx,
      currentName: 'a',
      executor,
    })
    expect(calls).toEqual([dir])
    expect(outcome.results[0]?.profile).toBe('a')
  })

  it('reports an unreadable profile manifest as a per-profile failure', async () => {
    const missing = join(process.cwd(), 'tests', 'tmp', `gone-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const ctx = makeCtx([{ name: 'a', dir: missing }])
    const executor = { add: async () => ({ exitCode: 0, stdout: '', stderr: '' }) }
    const outcome = await installIntoProfiles({
      request: { package: 'dshmarket', profiles: ['a'] },
      ctx,
      currentName: 'a',
      executor,
    })
    expect(outcome.overallOk).toBe(false)
    expect(outcome.results[0]?.ok).toBe(false)
    expect(outcome.results[0]?.error).toContain('profile manifest unreadable')
  })

  it('restores a succeeded profile when rollback is enabled on partial failure', async () => {
    const dirA = join(process.cwd(), 'tests', 'tmp', `rb-a-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const dirB = join(process.cwd(), 'tests', 'tmp', `rb-b-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    for (const dir of [dirA, dirB]) {
      mkdirSync(join(dir, 'node_modules', 'dshmarket'), { recursive: true })
      writeFileSync(join(dir, 'node_modules', 'dshmarket', 'package.json'), JSON.stringify({
        name: 'dshmarket',
        version: '1.5.1',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-profile-x', dependencies: { keep: '1.0.0' } }))
      roots.push(dir)
    }
    const ctx = makeCtx([{ name: 'a', dir: dirA }, { name: 'b', dir: dirB }])
    const executor = {
      add: async (target: string, profileDir: string) => {
        if (profileDir === dirB) return { exitCode: 1, stdout: '', stderr: 'boom' }
        pnpmWritesDep(target, profileDir)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const outcome = await installIntoProfiles({
      request: { package: 'dshmarket', spec: '1.5.1', profiles: ['a', 'b'] },
      ctx,
      currentName: 'a',
      executor,
      rollback: true,
    })
    expect(outcome.overallOk).toBe(false)
    expect(outcome.rolledBackProfiles).toEqual(['a'])
    // Profile a was restored: its pre-install manifest no longer lists dshmarket.
    expect(readProfileManifest(dirA).dependencies).toEqual({ keep: '1.0.0' })
    // A restore point exists for the manual undo path too.
    expect(findUndoSnapshots(dirA).length).toBeGreaterThan(0)
  })

  it('keeps v1 semantics (no rollback) when rollback is not requested', async () => {
    const dirA = join(process.cwd(), 'tests', 'tmp', `norb-a-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const dirB = join(process.cwd(), 'tests', 'tmp', `norb-b-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    for (const dir of [dirA, dirB]) {
      mkdirSync(join(dir, 'node_modules', 'dshmarket'), { recursive: true })
      writeFileSync(join(dir, 'node_modules', 'dshmarket', 'package.json'), JSON.stringify({
        name: 'dshmarket',
        version: '1.5.1',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-profile-x', dependencies: {} }))
      roots.push(dir)
    }
    const ctx = makeCtx([{ name: 'a', dir: dirA }, { name: 'b', dir: dirB }])
    const executor = {
      add: async (target: string, profileDir: string) => {
        if (profileDir === dirB) return { exitCode: 1, stdout: '', stderr: 'boom' }
        pnpmWritesDep(target, profileDir)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const outcome = await installIntoProfiles({
      request: { package: 'dshmarket', spec: '1.5.1', profiles: ['a', 'b'] },
      ctx,
      currentName: 'a',
      executor,
    })
    expect(outcome.rolledBackProfiles).toBeUndefined()
    expect(readProfileManifest(dirA).dependencies).toHaveProperty('dshmarket')
  })
})

describe('undo snapshots (F2)', () => {
  it('saves, lists, and restores the newest snapshot', () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    writeProfile(dir, { deps: { a: '1.0.0' }, bundles: ['a'] })
    roots.push(dir)
    const first = saveUndoSnapshot(dir, new Date('2025-01-01T00:00:00Z'))
    expect(first).not.toBeNull()
    // Mutate and snapshot again.
    const manifest = readProfileManifest(dir)
    manifest.dependencies = { a: '2.0.0' }
    writeProfileManifest(dir, manifest)
    const second = saveUndoSnapshot(dir, new Date('2025-01-02T00:00:00Z'))
    expect(second).not.toBeNull()

    const snapshots = findUndoSnapshots(dir)
    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]?.ts).toBe(second?.ts)

    const result = undoProfile(dir, 'x')
    expect(result.ok).toBe(true)
    expect(readProfileManifest(dir).dependencies).toEqual({ a: '2.0.0' })
  })

  it('reports a missing snapshot as a failure', () => {
    const dir = join(process.cwd(), 'tests', 'tmp', `undonone-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    writeProfile(dir, { deps: {}, bundles: [] })
    roots.push(dir)
    const result = undoProfile(dir, 'x')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no undo snapshot')
  })
})

function writeProfile(dir: string, options: { deps: Record<string, string>; bundles: string[] }): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-x',
    private: true,
    dependencies: options.deps,
    dsh: { profile: { bundles: options.bundles } },
  }))
}

const roots: string[] = []

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})
