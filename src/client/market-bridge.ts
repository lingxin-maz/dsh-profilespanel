/**
 * Market → panel jump receive side (F17). The settings shell mounts only
 * the active section, so another section (e.g. dshmarket's market tab) or
 * any same-page script cannot hand an install target to the mounted panel
 * directly. Instead it can either
 *
 *   - dispatch
 *       window.dispatchEvent(new CustomEvent('dsh-profile-panel:install-target', {
 *         detail: { package: 'dsh-xxx', spec: '1.2.3' },
 *       }))
 *     (`package` may also be a github:owner/repo[#path:/sub] target — spec
 *     is npm-only), or
 *   - deep-link with
 *       <page-url>#dshpp-install=<urlencoded package>[@spec]
 *
 * The target is parked here and consumed by the InstallSection the next
 * time it mounts (the user opens the Profile / Plugins section), which
 * pre-fills the download module and auto-runs the version preview.
 */

export interface InstallTargetPayload {
  package: string
  spec?: string
}

const PACKAGE_RE = /^(@[A-Za-z0-9-~][A-Za-z0-9._~-]*\/)?[A-Za-z0-9-~][A-Za-z0-9._~-]*$/
const GITHUB_RE = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#path:\/([A-Za-z0-9_./-]+))?$/
const SPEC_RE = /^[A-Za-z0-9~^<>=*+-][A-Za-z0-9._~^<>=*+-]*$/

/** Validate the shape of a pushed install target; null when malformed. */
export function normalizeTarget(payload: unknown): InstallTargetPayload | null {
  if (payload === null || typeof payload !== 'object') return null
  const candidate = payload as Record<string, unknown>
  if (typeof candidate.package !== 'string') return null
  const pkg = candidate.package.trim()
  if (pkg === '') return null
  const github = GITHUB_RE.exec(pkg)
  if (github === null && !PACKAGE_RE.test(pkg)) return null
  if (github !== null && github[2] !== undefined
    && github[2].split('/').some(seg => seg === '' || seg === '.' || seg === '..')) return null
  let spec: string | undefined
  if (candidate.spec !== undefined && candidate.spec !== null && candidate.spec !== '') {
    if (typeof candidate.spec !== 'string' || !SPEC_RE.test(candidate.spec) || github !== null) return null
    spec = candidate.spec
  }
  return { package: pkg, ...(spec !== undefined ? { spec } : {}) }
}

/** Parse the `#dshpp-install=<target>` deep link out of a location hash. */
export function readHashTarget(hash: string): InstallTargetPayload | null {
  const marker = '#dshpp-install='
  if (!hash.startsWith(marker)) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(hash.slice(marker.length))
  } catch {
    return null
  }
  const at = decoded.lastIndexOf('@')
  if (at > 0) {
    const pkg = decoded.slice(0, at)
    const spec = decoded.slice(at + 1)
    if (spec !== '') return normalizeTarget({ package: pkg, spec })
  }
  return normalizeTarget({ package: decoded })
}

let parked: InstallTargetPayload | null = null

/** Park a target for the InstallSection (module scope, survives unmounts). */
export function parkInstallTarget(payload: InstallTargetPayload): void {
  parked = payload
}

/** The pending target if one is parked; consumes it (single-shot). */
export function consumePendingTarget(): InstallTargetPayload | null {
  const target = parked
  parked = null
  return target
}

export const INSTALL_TARGET_EVENT = 'dsh-profile-panel:install-target'

/**
 * Wire the receive side: window event listener + the initial hash deep
 * link. Returns a disposer removing the listener.
 */
export function installMarketBridge(): () => void {
  const onEvent = (event: Event): void => {
    const payload = normalizeTarget((event as CustomEvent<unknown>).detail)
    if (payload !== null) parkInstallTarget(payload)
  }
  window.addEventListener(INSTALL_TARGET_EVENT, onEvent)
  const fromHash = readHashTarget(window.location.hash)
  if (fromHash !== null) parkInstallTarget(fromHash)
  return () => {
    window.removeEventListener(INSTALL_TARGET_EVENT, onEvent)
  }
}
