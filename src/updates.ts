/**
 * F3 update detection: which installed bundle dependencies are outdated
 * against the registry, plus the shared update/align execution (which reuses
 * the install executor, reconcile, and downgrade marking verbatim).
 */

import { releaseAgeDays, type RegistryView } from './registry.ts'
import { semverCompare, installIntoProfiles, type PnpmExecutor } from './install.ts'
import { declaresBundlePatch, manifestDeps, readInstalledVersion, readProfileManifest } from './profile.ts'
import type { Context } from '@deepseek-ai/cordis'

export interface UpdateRow {
  bundle: string
  installed: string | null
  latest: string | null
  outdated: boolean
  releaseAgeDays: number | null
}

export interface UpdatesPayload {
  profile: string
  updatedAt: string
  updates: UpdateRow[]
  warnings?: Array<{ code: string; message: string }>
}

/** F17: dependency specs the npm registry cannot answer for. */
export function isNonRegistrySpec(spec: string): boolean {
  return /^(?:github:|git\+|git:|link:|file:|workspace:|portal:)/.test(spec)
}

/** Installed dependency names that declare `dsh.bundle.patch` (the panel's bundle set). */
export function listBundleDependencies(profileDir: string): string[] {
  const manifest = readProfileManifest(profileDir)
  return Object.keys(manifest.dependencies ?? {}).filter(name => declaresBundlePatch(profileDir, name))
}

/**
 * Collect per-bundle update status for one profile. Registry failures
 * degrade to warnings (the feed never blocks on the network). F17:
 * GitHub/link/file deps are reported with their spec but never queried
 * against the npm registry (their names usually do not exist there).
 */
export async function collectUpdates(options: {
  profileDir: string
  profileName: string
  registryView: (pkg: string) => Promise<RegistryView>
}): Promise<UpdatesPayload> {
  const { profileDir, profileName, registryView } = options
  const warnings: Array<{ code: string; message: string }> = []
  const updates: UpdateRow[] = []
  const deps = manifestDeps(readProfileManifest(profileDir))
  for (const bundle of listBundleDependencies(profileDir)) {
    const spec = deps[bundle]
    if (spec !== undefined && isNonRegistrySpec(spec)) {
      updates.push({
        bundle,
        installed: spec.length > 64 ? `${spec.slice(0, 64)}…` : spec,
        latest: null,
        outdated: false,
        releaseAgeDays: null,
      })
      warnings.push({ code: 'non-registry', message: `${bundle}: 非 registry 安装（${spec.startsWith('github:') ? 'GitHub' : '本地'}），跳过版本检查` })
      continue
    }
    const installed = readInstalledVersion(profileDir, bundle)
    const view = await registryView(bundle)
    if (!view.ok) {
      warnings.push({ code: view.code, message: `${bundle}: ${view.message}` })
      continue
    }
    const latest = view.latest
    const outdated = installed !== null
      && latest !== null
      && semverCompare(latest, installed) > 0
    updates.push({
      bundle,
      installed,
      latest,
      outdated,
      releaseAgeDays: releaseAgeDays(view.publishedAt),
    })
  }
  return {
    profile: profileName,
    updatedAt: new Date().toISOString(),
    updates,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

/**
 * F3 update: install a (usually newer) spec into the given profiles. Pure
 * reuse of the install executor — update is an install with a version.
 */
export async function updateIntoProfiles(options: {
  request: { package: string; spec?: string; profiles?: string[] }
  ctx: Context
  currentName: string
  executor?: PnpmExecutor
}): Promise<ReturnType<typeof installIntoProfiles>> {
  return installIntoProfiles({
    request: options.request,
    ctx: options.ctx,
    currentName: options.currentName,
    ...(options.executor !== undefined ? { executor: options.executor } : {}),
  })
}

/**
 * F3 align: bring one package to the same version across several profiles.
 * `version` defaults to the registry latest; a registry failure surfaces as
 * a typed error before anything is installed.
 */
export async function alignAcrossProfiles(options: {
  request: { package: string; profiles: string[]; version?: string }
  ctx: Context
  currentName: string
  registryView: (pkg: string) => Promise<RegistryView>
  executor?: PnpmExecutor
}): Promise<ReturnType<typeof installIntoProfiles> | { error: string }> {
  const { request, ctx, currentName, registryView } = options
  let version = request.version
  if (version === undefined || version === '') {
    const view = await registryView(request.package)
    if (!view.ok || view.latest === null) {
      return { error: `cannot resolve the latest version of ${request.package}: ${view.ok ? 'no latest dist-tag' : view.message}` }
    }
    version = view.latest
  }
  return installIntoProfiles({
    request: { package: request.package, spec: version, profiles: request.profiles },
    ctx,
    currentName,
    ...(options.executor !== undefined ? { executor: options.executor } : {}),
  })
}
