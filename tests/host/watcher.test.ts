import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProfileWatcher, sameChanges } from '../../src/watcher.ts'
import { readProfileManifest, snapshotProfile, writeProfileManifest } from '../../src/profile.ts'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const roots: string[] = []

function makeProfile(label: string): string {
  const dir = join(process.cwd(), 'tests', 'tmp', `watch-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-x',
    private: true,
    dependencies: { '@deepseek-ai/dsh-base': '^1.0.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }))
  roots.push(dir)
  return dir
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})

describe('sameChanges', () => {
  it('compares change reports structurally', () => {
    const a = { changedFiles: ['package.json'], addedBundles: ['x'], removedBundles: [] }
    const b = { changedFiles: ['package.json'], addedBundles: ['x'], removedBundles: [] }
    const c = { changedFiles: ['pnpm-lock.yaml'], addedBundles: ['x'], removedBundles: [] }
    expect(sameChanges(a, b)).toBe(true)
    expect(sameChanges(a, c)).toBe(false)
    expect(sameChanges(null, null)).toBe(true)
    expect(sameChanges(a, null)).toBe(false)
  })
})

describe('createProfileWatcher', () => {
  it('detects a bundle addition through the poll fallback', () => {
    const dir = makeProfile('poll')
    const boot = snapshotProfile({ name: 'x', dir, desktop: false })
    const onPending = vi.fn()
    const onClean = vi.fn()
    const watcher = createProfileWatcher({
      profileDir: dir,
      boot,
      pollIntervalMs: 50,
      debounceMs: 500,
      onPending,
      onClean,
    })
    try {
      // Initial check reports the boot baseline (no callback: unchanged).
      expect(onPending).not.toHaveBeenCalled()
      const manifest = readProfileManifest(dir)
      manifest.dsh = { profile: { bundles: [...boot.bundles, 'dshmarket'] } }
      writeProfileManifest(dir, manifest)
      vi.advanceTimersByTime(200)
      expect(onPending).toHaveBeenCalledTimes(1)
      expect(onPending.mock.calls[0]?.[0]?.addedBundles).toEqual(['dshmarket'])
    } finally {
      watcher.dispose()
    }
  })

  it('debounces rapid changes into a single report', () => {
    const dir = makeProfile('debounce')
    const boot = snapshotProfile({ name: 'x', dir, desktop: false })
    const onPending = vi.fn()
    const watcher = createProfileWatcher({
      profileDir: dir,
      boot,
      pollIntervalMs: 50,
      debounceMs: 500,
      onPending,
      onClean: () => {},
    })
    try {
      const manifest = readProfileManifest(dir)
      manifest.dependencies = { ...manifest.dependencies, dshmarket: '1.5.1' }
      writeProfileManifest(dir, manifest)
      watcher.checkNow()
      watcher.checkNow()
      watcher.checkNow()
      vi.advanceTimersByTime(1000)
      expect(onPending).toHaveBeenCalledTimes(1)
    } finally {
      watcher.dispose()
    }
  })

  it('reports clean again after the change is reverted', () => {
    const dir = makeProfile('revert')
    const boot = snapshotProfile({ name: 'x', dir, desktop: false })
    const onPending = vi.fn()
    const onClean = vi.fn()
    const watcher = createProfileWatcher({
      profileDir: dir,
      boot,
      pollIntervalMs: 50,
      debounceMs: 500,
      onPending,
      onClean,
    })
    try {
      const manifest = readProfileManifest(dir)
      manifest.dependencies = { ...manifest.dependencies, dshmarket: '1.5.1' }
      writeProfileManifest(dir, manifest)
      vi.advanceTimersByTime(200)
      expect(onPending).toHaveBeenCalledTimes(1)
      manifest.dependencies = { '@deepseek-ai/dsh-base': '^1.0.0' }
      writeProfileManifest(dir, manifest)
      vi.advanceTimersByTime(200)
      expect(onClean).toHaveBeenCalledTimes(1)
    } finally {
      watcher.dispose()
    }
  })

  it('stops reporting after dispose', () => {
    const dir = makeProfile('dispose')
    const boot = snapshotProfile({ name: 'x', dir, desktop: false })
    const onPending = vi.fn()
    const watcher = createProfileWatcher({
      profileDir: dir,
      boot,
      pollIntervalMs: 50,
      debounceMs: 500,
      onPending,
      onClean: () => {},
    })
    watcher.dispose()
    const manifest = readProfileManifest(dir)
    manifest.dependencies = { ...manifest.dependencies, dshmarket: '1.5.1' }
    writeProfileManifest(dir, manifest)
    vi.advanceTimersByTime(1000)
    expect(onPending).not.toHaveBeenCalled()
  })
})
