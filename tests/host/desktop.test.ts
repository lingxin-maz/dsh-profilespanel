import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  desktopAppDataDir,
  detectDesktop,
  dualOtherEnd,
  readDesktopSelection,
  resolveInstallTargets,
} from '../../src/desktop.ts'

const roots: string[] = []

function fixture(label: string): string {
  const dir = join(process.cwd(), 'tests', 'tmp', `desktop-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  roots.push(dir)
  return dir
}

function writeWebCapableProfile(home: string, name: string): void {
  const dir = join(home, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `dsh-profile-${name}`,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }))
}

describe('desktopAppDataDir', () => {
  it('resolves per-platform data directories', () => {
    // join() keeps expectations platform-native (Windows uses backslashes).
    expect(desktopAppDataDir('win32', { APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'C:\\Users\\x'))
      .toBe(join('C:\\Users\\x\\AppData\\Roaming', 'DSH Desktop'))
    expect(desktopAppDataDir('darwin', {}, '/Users/x'))
      .toBe(join('/Users/x', 'Library', 'Application Support', 'DSH Desktop'))
    expect(desktopAppDataDir('linux', {}, '/home/x'))
      .toBe(join('/home/x', '.config', 'DSH Desktop'))
  })
})

describe('detectDesktop', () => {
  it('reports runtime when the desktopProfiles service exists', () => {
    const presence = detectDesktop({ hasDesktopProfilesService: true, currentDesktopName: 'desktop' })
    expect(presence).toEqual({ detected: true, reason: 'runtime', desktopProfile: 'desktop' })
  })

  it('reports profile when a webCapable desktop profile exists', () => {
    const home = fixture('profile')
    writeWebCapableProfile(home, 'desktop')
    const presence = detectDesktop({ hasDesktopProfilesService: false, dshHomePath: home })
    expect(presence).toEqual({ detected: true, reason: 'profile', desktopProfile: 'desktop' })
  })

  it('ignores a non-web-capable desktop profile', () => {
    const home = fixture('nonweb')
    const dir = join(home, 'profiles', 'desktop')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-profile-desktop', dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
    const presence = detectDesktop({ hasDesktopProfilesService: false, dshHomePath: home, platform: 'linux', env: {} })
    expect(presence.detected).toBe(false)
    expect(presence.reason).toBe('none')
  })

  it('reports app-data when the desktop app data directory exists', () => {
    const appDir = fixture('appdata')
    mkdirSync(join(appDir, 'DSH Desktop'), { recursive: true })
    const presence = detectDesktop({
      hasDesktopProfilesService: false,
      dshHomePath: fixture('empty'),
      platform: 'win32',
      env: { APPDATA: appDir },
    })
    expect(presence.detected).toBe(true)
    expect(presence.reason).toBe('app-data')
    expect(presence.appDataDir).toBe(join(appDir, 'DSH Desktop'))
  })

  it('reports none when nothing matches', () => {
    const presence = detectDesktop({
      hasDesktopProfilesService: false,
      dshHomePath: fixture('none'),
      platform: 'linux',
      env: {},
    })
    expect(presence).toEqual({ detected: false, reason: 'none' })
  })
})

describe('dualOtherEnd', () => {
  const presence = { detected: true, reason: 'profile' as const, desktopProfile: 'desktop' }
  it('pairs web with the desktop end and desktop with web', () => {
    expect(dualOtherEnd('web', presence)).toBe('desktop')
    expect(dualOtherEnd('desktop', presence)).toBe('web')
  })
  it('pairs a custom profile with the desktop end', () => {
    expect(dualOtherEnd('custom', presence)).toBe('desktop')
    expect(dualOtherEnd('custom', { detected: false, reason: 'none' })).toBe('desktop')
  })
})

describe('resolveInstallTargets', () => {
  const presence = { detected: true, reason: 'profile' as const, desktopProfile: 'desktop' }
  const available = [
    { name: 'web', dir: 'w', webCapable: true },
    { name: 'desktop', dir: 'd', webCapable: true },
    { name: 'extra', dir: 'e', webCapable: true },
  ]

  it('prefers an explicit profiles list over any mode', () => {
    const result = resolveInstallTargets({
      requested: ['extra'],
      mode: 'dual',
      currentName: 'web',
      presence,
      available,
    })
    expect(result.profiles).toEqual(['extra'])
    expect(result.warnings).toEqual([])
  })

  it('defaults to single (current only)', () => {
    const result = resolveInstallTargets({ currentName: 'web', presence, available })
    expect(result.profiles).toEqual(['web'])
    expect(result.warnings).toEqual([])
  })

  it('dual pairs web with the desktop end', () => {
    const result = resolveInstallTargets({ mode: 'dual', currentName: 'web', presence, available })
    expect(result.profiles).toEqual(['web', 'desktop'])
    expect(result.warnings).toEqual([])
  })

  it('dual pairs desktop with web', () => {
    const result = resolveInstallTargets({ mode: 'dual', currentName: 'desktop', presence, available })
    expect(result.profiles).toEqual(['desktop', 'web'])
  })

  it('dual degrades to current plus a warning when the other end is unavailable', () => {
    const result = resolveInstallTargets({
      mode: 'dual',
      currentName: 'web',
      presence: { detected: true, reason: 'app-data' },
      available: [available[0]!],
    })
    expect(result.profiles).toEqual(['web'])
    expect(result.warnings).toEqual([{ code: 'dual-unavailable', message: expect.stringContaining('desktop') }])
  })

  it('dual degrades when no desktop GUI is detected at all', () => {
    const result = resolveInstallTargets({
      mode: 'dual',
      currentName: 'web',
      presence: { detected: false, reason: 'none' },
      available,
    })
    expect(result.profiles).toEqual(['web'])
    expect(result.warnings[0]?.code).toBe('dual-unavailable')
    expect(result.warnings[0]?.message).toContain('no desktop GUI detected')
  })

  it('all resolves to every available profile', () => {
    const result = resolveInstallTargets({ mode: 'all', currentName: 'web', presence, available })
    expect(result.profiles).toEqual(['web', 'desktop', 'extra'])
  })
})

describe('readDesktopSelection (F14)', () => {
  it('reads active and lastKnownGood from the selection state file', () => {
    const appDir = fixture('selection')
    mkdirSync(join(appDir, 'profile-selection'), { recursive: true })
    writeFileSync(join(appDir, 'profile-selection', 'state.json'), JSON.stringify({ active: 'desktop', lastKnownGood: 'web' }))
    expect(readDesktopSelection(appDir)).toEqual({ active: 'desktop', lastKnownGood: 'web' })
  })

  it('returns null for missing or uninformative files', () => {
    const appDir = fixture('selection-none')
    expect(readDesktopSelection(appDir)).toBeNull()
    mkdirSync(join(appDir, 'profile-selection'), { recursive: true })
    writeFileSync(join(appDir, 'profile-selection', 'state.json'), JSON.stringify({ other: 1 }))
    expect(readDesktopSelection(appDir)).toBeNull()
    writeFileSync(join(appDir, 'profile-selection', 'state.json'), 'not json')
    expect(readDesktopSelection(appDir)).toBeNull()
  })
})

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})
