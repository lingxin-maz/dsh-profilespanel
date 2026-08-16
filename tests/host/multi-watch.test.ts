import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMultiProfileWatcher, type ProfilePendingState } from '../../src/multi-watch.ts'
import { readProfileManifest, writeProfileManifest } from '../../src/profile.ts'

const roots: string[] = []

function writeProfile(home: string, name: string, bundles: string[] = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']): string {
  const dir = join(home, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `dsh-profile-${name}`,
    dependencies: {},
    dsh: { profile: { bundles } },
  }))
  roots.push(dir)
  return dir
}

function summary(name: string, dir: string) {
  return { name, dir, webCapable: true }
}

async function waitTick(ms = 30): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

describe('createMultiProfileWatcher (F5)', () => {
  it('emits only the pending profiles after one profile changes', async () => {
    const home = join(process.cwd(), 'tests', 'tmp', `mw-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(home, { recursive: true })
    roots.push(home)
    const dirA = writeProfile(home, 'a')
    const dirB = writeProfile(home, 'b')
    const seen: ProfilePendingState[][] = []
    const multi = createMultiProfileWatcher({
      profiles: [summary('a', dirA), summary('b', dirB)],
      pollIntervalMs: 10,
      debounceMs: 5,
      onChange: states => seen.push(states),
    })
    try {
      // Mutate profile a: add a bundle after the boot snapshot.
      const manifest = readProfileManifest(dirA)
      manifest.dsh = { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'new-plugin'] } }
      writeProfileManifest(dirA, manifest)
      await waitTick(80)
      expect(seen.some(states =>
        states.length === 1 && states[0]?.profile === 'a' && states[0]?.pendingRestart)).toBe(true)
      expect(seen.some(states => states.some(state => state.profile === 'b' && state.pendingRestart))).toBe(false)
    } finally {
      multi.dispose()
    }
  })

  it('caps the watched profile count at maxProfiles', async () => {
    const home = join(process.cwd(), 'tests', 'tmp', `mwcap-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(home, { recursive: true })
    roots.push(home)
    const profiles = []
    for (let index = 0; index < 12; index++) {
      profiles.push(summary(`p${index}`, writeProfile(home, `p${index}`)))
    }
    const seen: ProfilePendingState[][] = []
    const multi = createMultiProfileWatcher({
      profiles,
      pollIntervalMs: 10,
      debounceMs: 5,
      maxProfiles: 10,
      onChange: states => seen.push(states),
    })
    try {
      const manifest = readProfileManifest(profiles[11]!.dir)
      manifest.dsh = { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'x'] } }
      writeProfileManifest(profiles[11]!.dir, manifest)
      await waitTick(80)
      // p11 is beyond the cap and must never report.
      expect(seen.some(states => states.some(state => state.profile === 'p11'))).toBe(false)
    } finally {
      multi.dispose()
    }
  })

  it('tolerates an unreadable manifest without crashing', () => {
    const home = join(process.cwd(), 'tests', 'tmp', `mwbad-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(home, { recursive: true })
    roots.push(home)
    const bad = join(home, 'bad')
    mkdirSync(bad, { recursive: true })
    writeFileSync(join(bad, 'package.json'), 'not json')
    const multi = createMultiProfileWatcher({
      profiles: [summary('bad', bad)],
      pollIntervalMs: 10,
      debounceMs: 5,
      onChange: () => {},
    })
    expect(() => multi.checkNow()).not.toThrow()
    multi.dispose()
  })
})

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})
