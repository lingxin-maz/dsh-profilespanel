/**
 * F7 profile comparison: which bundle dependencies differ between two
 * profiles (missing on one side, version drift). Feeds the panel's
 * side-by-side CompareCard. Pure reads — never writes.
 */

import { readInstalledVersion } from './profile.ts'
import { listBundleDependencies } from './updates.ts'

export interface ProfileDiff {
  profiles: string[]
  onlyInA: string[]
  onlyInB: string[]
  versionDiffers: Array<{ bundle: string; a: string | null; b: string | null }>
}

export function diffProfiles(options: {
  a: { name: string; dir: string }
  b: { name: string; dir: string }
}): ProfileDiff {
  const { a, b } = options
  const bundlesA = new Set(listBundleDependencies(a.dir))
  const bundlesB = new Set(listBundleDependencies(b.dir))
  const onlyInA = [...bundlesA].filter(name => !bundlesB.has(name))
  const onlyInB = [...bundlesB].filter(name => !bundlesA.has(name))
  const versionDiffers: ProfileDiff['versionDiffers'] = []
  for (const name of [...bundlesA].filter(name => bundlesB.has(name))) {
    const versionA = readInstalledVersion(a.dir, name)
    const versionB = readInstalledVersion(b.dir, name)
    if (versionA !== versionB) {
      versionDiffers.push({ bundle: name, a: versionA, b: versionB })
    }
  }
  return { profiles: [a.name, b.name], onlyInA, onlyInB, versionDiffers }
}
