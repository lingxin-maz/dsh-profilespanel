/**
 * F8 bundle source attribution: where each layer entry comes from (in-box
 * vs a profile dependency vs a patch-only leftover) plus the F12 HMR
 * capability probe. Pure reads — never writes.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { declaresBundlePatch, manifestDeps, readProfileManifest } from './profile.ts'

export type BundleSource = 'inbox' | 'dependency' | 'patch'

export interface BundleAttribution {
  source: BundleSource
  layerIndex: number
  introducedBy?: string
  hotReloadable: boolean
}

const HMR_MARKERS = ['cordis-plugin-hmr', '@deepseek-ai/dsh-client-hmr', '@deepseek-ai/cordis-plugin-hmr']

/** Read a package's own manifest from the profile's node_modules. */
export function readOwnPackage(dir: string, name: string): Record<string, unknown> | null {
  const candidates = [join(dir, 'node_modules', name, 'package.json')]
  try {
    const files = readdirSync(join(dir, 'node_modules', '.pnpm'), { withFileTypes: true })
    for (const file of files) {
      if (file.isDirectory() && file.name.startsWith(name.replace('/', '+') + '@')) {
        candidates.push(join(dir, 'node_modules', '.pnpm', file.name, 'node_modules', name, 'package.json'))
      }
    }
  } catch { /* no .pnpm layout */ }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as unknown
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch { /* keep looking */ }
  }
  return null
}

/** F12 probe: does the package declare hot-reload capability? */
export function isHotReloadable(dir: string, name: string): boolean {
  const own = readOwnPackage(dir, name)
  if (own === null) return false
  const dsh = own.dsh as { hot?: unknown } | undefined
  if (dsh?.hot === true) return true
  const deps = own.dependencies as Record<string, string> | undefined
  if (deps !== undefined && HMR_MARKERS.some(marker => marker in deps)) return true
  return false
}

/**
 * Attribute one bundle layer entry. `dependencies` comes from the profile
 * manifest; in-box packages (never dependencies) are the official stack.
 */
export function attributeBundle(options: {
  name: string
  index: number
  dependencies: Record<string, string>
  profileDir: string
}): BundleAttribution {
  const { name, index, dependencies, profileDir } = options
  const spec = dependencies[name]
  const declares = declaresBundlePatch(profileDir, name)
  let source: BundleSource = 'inbox'
  let introducedBy: string | undefined
  if (spec !== undefined) {
    source = 'dependency'
    introducedBy = `${name}@${spec}`
  } else if (declares) {
    source = 'patch'
  }
  return {
    source,
    layerIndex: index,
    ...(introducedBy !== undefined ? { introducedBy } : {}),
    hotReloadable: isHotReloadable(profileDir, name),
  }
}

/** F8: attribute every layer entry of a profile manifest. */
export function attributeBundles(profileDir: string): Array<{ name: string } & BundleAttribution> {
  const manifest = readProfileManifest(profileDir)
  const dependencies = manifestDeps(manifest)
  const bundles = manifest.dsh?.profile?.bundles ?? []
  return bundles.map((name, index) => ({
    name,
    ...attributeBundle({ name, index, dependencies, profileDir }),
  }))
}
