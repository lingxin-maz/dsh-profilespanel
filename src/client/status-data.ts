/**
 * Response shapes of the /api/profile-panel/* host routes plus the pure
 * helpers shared by the panel UI.
 */

/** One bundle row from /api/profile-panel/status. */
export type BundleState = 'loaded' | 'pending'

export interface BundleRow {
  name: string
  state: BundleState
  /** F8 attribution (optional for older hosts). */
  source?: 'inbox' | 'dependency' | 'patch'
  layerIndex?: number
  introducedBy?: string
  hotReloadable?: boolean
}

/** Post-boot change report. */
export interface ChangesInfo {
  changedFiles: string[]
  addedBundles: string[]
  removedBundles: string[]
}

/** One profile offered by the sync-install section. */
export interface ProfileRow {
  name: string
  dir: string
  current: boolean
}

/** F16 desktop-end presence from the host. */
export interface DesktopStatus {
  detected: boolean
  reason: 'runtime' | 'profile' | 'app-data' | 'none'
  profile?: string
  appDataDir?: string
}

/** F5: one other profile that needs a restart. */
export interface ProfilePendingRow {
  profile: string
  pendingRestart: boolean
  changes: ChangesInfo | null
}

/** Poll payload from GET /api/profile-panel/status. */
export interface PanelStatus {
  profileName: string
  profileDir: string
  profileExists: boolean
  manifestError?: string
  bundles: BundleRow[]
  pendingRestart: boolean
  changes: ChangesInfo | null
  restart: {
    available: boolean
    restarting: boolean
    hint: string
  }
  profiles: ProfileRow[]
  desktop: DesktopStatus
  minimumReleaseAgeDays: number
  profilesPending: ProfilePendingRow[]
  /** F14: desktop app's active/lastKnownGood selection (desktop hosts only). */
  desktopSelection?: { active?: string; lastKnownGood?: string }
}

/** One per-profile row of POST /api/profile-panel/install. */
export interface InstallRowResult {
  profile: string
  ok: boolean
  error?: string
  requestedVersion?: string | null
  resolvedVersion?: string | null
  downgraded?: boolean
  /** F17: dependency names a GitHub install added. */
  installedAs?: string[]
}

/** Payload of POST /api/profile-panel/install. */
export interface InstallResponse {
  overallOk: boolean
  results: InstallRowResult[]
  warnings?: Array<{ code: string; message: string }>
  rolledBackProfiles?: string[]
  /** F13: an auto-restart was scheduled; cancel it with postCancelRestart. */
  autoRestart?: { scheduled: true; inMs: number; cancelToken: string }
  /** F13: autoRestart was requested but the host declined it. */
  autoRestartSkipped?: boolean
}

/** Payload of POST /api/profile-panel/install-preview (F1). */
export interface InstallPreviewResponse {
  ok: boolean
  package: string
  spec: string | null
  /** 'npm' when the preview came from the registry, 'github' for repo targets. */
  source?: 'npm' | 'github'
  latest: string | null
  publishedAt: string | null
  releaseAgeDays: number | null
  minimumReleaseAgeDays: number
  warnings: Array<{ code: 'release-age' | 'network' | 'not-found' | 'github-source'; message: string }>
  suggestedPin: string | null
}

/** F17: one market search result row. */
export interface MarketHit {
  name: string
  owner: string | null
  url: string
  category: string | null
  description: string | null
  npm: string | null
  stars: number | null
  added: string | null
  kind: 'npm' | 'github'
  installTarget: string
}

/** F17: payload of GET /api/profile-panel/market/search. */
export interface MarketSearchPayload {
  ok: boolean
  source: 'live' | 'cache' | 'snapshot' | 'none'
  updated: string | null
  total: number
  query: string
  results: MarketHit[]
  warning?: string
}

/** Payload of POST /api/profile-panel/undo (F2). */
export interface UndoResponse {
  ok: boolean
  results: Array<{ profile: string; ok: boolean; restoredTs?: string; error?: string; hint?: string }>
}

/** F3: one bundle's update status against the registry. */
export interface UpdateRow {
  bundle: string
  installed: string | null
  latest: string | null
  outdated: boolean
  releaseAgeDays: number | null
}

/** F3: payload of GET /api/profile-panel/updates. */
export interface UpdatesPayload {
  profile: string
  updatedAt: string
  updates: UpdateRow[]
  warnings?: Array<{ code: string; message: string }>
}

/** F6: one health issue. */
export interface HealthIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  bundle?: string
  message: string
}

/** F6: payload of GET /api/profile-panel/health. */
export interface HealthPayload {
  profile: string
  ok: boolean
  nextBundles: string[]
  issues: HealthIssue[]
}

/** F7: payload of GET /api/profile-panel/diff. */
export interface ProfileDiff {
  profiles: string[]
  onlyInA: string[]
  onlyInB: string[]
  versionDiffers: Array<{ bundle: string; a: string | null; b: string | null }>
}

/** F10: one audit entry. */
export interface AuditEntry {
  ts: number
  action: string
  profile: string
  package?: string
  spec?: string
  resolved?: string
  ok: boolean
  error?: string | null
}

/** F10: payload of GET /api/profile-panel/audit. */
export interface AuditPayload {
  total: number
  entries: AuditEntry[]
}

/** F9: one boot-report entry. */
export interface BootReportEntry {
  id: string
  module?: string
  phase: string | null
  error?: string
}

/** F9: payload of GET /api/profile-panel/boot-report. */
export interface BootReportPayload {
  bootedAt: string
  entries: BootReportEntry[]
}

/**
 * The dual-install pair for the current end (mirror of the host's
 * `dualOtherEnd`): `web` pairs with the desktop end, `desktop` pairs with
 * `web`, and any other name pairs with the desktop end.
 */
export function dualPair(currentName: string, desktopProfile?: string): string[] {
  if (currentName === 'web') {
    return desktopProfile !== undefined && desktopProfile !== currentName
      ? [currentName, desktopProfile]
      : [currentName]
  }
  if (currentName === 'desktop') return ['desktop', 'web']
  return desktopProfile !== undefined && desktopProfile !== currentName
    ? [currentName, desktopProfile]
    : [currentName]
}

/**
 * Coerce any wire value to a safe array. Host payloads may drift (the
 * client-side card code must never throw on a non-array field), so every
 * payload list renders through this helper.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

/**
 * Abbreviate an absolute path for display: the home directory plus the
 * `profiles` segment collapses to `~/<home>/profiles/...` (the panel never
 * leaks more than it must).
 */
export function abbreviatePath(dir: string): string {
  const separator = dir.includes('\\') ? '\\' : '/'
  const parts = dir.split(/[\\/]/)
  const index = parts.indexOf('profiles')
  if (index <= 0) return dir
  const kept = parts.slice(Math.max(0, index - 1))
  return `~${separator}${kept.join(separator)}`
}

/** Short change summary for the pending-restart banner. */
export function summarizeChanges(changes: ChangesInfo, t: (key: string) => string): string {
  const parts: string[] = []
  if (changes.addedBundles.length > 0) parts.push(t('addedBundles') + ': ' + changes.addedBundles.join(', '))
  if (changes.removedBundles.length > 0) parts.push(t('removedBundles') + ': ' + changes.removedBundles.join(', '))
  if (changes.changedFiles.length > 0) parts.push(t('changedFiles') + ': ' + changes.changedFiles.join(', '))
  return parts.length > 0 ? parts.join(' · ') : t('restartBanner')
}

/** Read the status endpoint; throws on transport failure or bad payload. */
export async function fetchStatus(): Promise<PanelStatus> {
  const response = await fetch('/api/profile-panel/status', { cache: 'no-store' })
  if (!response.ok) throw new Error(`status request failed: ${response.status}`)
  return await response.json() as PanelStatus
}

/** POST the one-click restart. */
export async function postRestart(): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetch('/api/profile-panel/restart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch { /* empty body */ }
  return { ok: response.ok, status: response.status, payload }
}

/** POST a sync install into the given profiles (or a resolved mode). */
export async function postInstall(body: {
  package: string
  spec?: string
  profiles?: string[]
  mode?: 'single' | 'dual' | 'all'
  preview?: boolean
  rollback?: boolean
}): Promise<InstallResponse> {
  const response = await fetch('/api/profile-panel/install', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json() as { error?: string }
      detail = parsed.error ?? ''
    } catch { /* non-json */ }
    throw new Error(detail || `install request failed: ${response.status}`)
  }
  return await response.json() as InstallResponse
}

/** POST the install-preview assistant (F1). */
export async function postInstallPreview(body: {
  package: string
  spec?: string
}): Promise<InstallPreviewResponse> {
  const response = await fetch('/api/profile-panel/install-preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json() as { error?: string }
      detail = parsed.error ?? ''
    } catch { /* non-json */ }
    throw new Error(detail || `preview request failed: ${response.status}`)
  }
  return await response.json() as InstallPreviewResponse
}

/** F17: search the market registry backing dshmarket. */
export async function fetchMarketSearch(q: string, limit = 8): Promise<MarketSearchPayload> {
  const response = await fetch(`/api/profile-panel/market/search?q=${encodeURIComponent(q)}&limit=${limit}`, { cache: 'no-store' })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json() as { error?: string }
      detail = parsed.error ?? ''
    } catch { /* non-json */ }
    throw new Error(detail || `market search failed: ${response.status}`)
  }
  return await response.json() as MarketSearchPayload
}

/** POST an undo (F2) restoring the newest manifest snapshot per profile. */
export async function postUndo(body: { profiles: string[] }): Promise<UndoResponse> {
  const response = await fetch('/api/profile-panel/undo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json() as { error?: string }
      detail = parsed.error ?? ''
    } catch { /* non-json */ }
    throw new Error(detail || `undo request failed: ${response.status}`)
  }
  return await response.json() as UndoResponse
}

/** F3: read the per-bundle update feed. */
export async function fetchUpdates(): Promise<UpdatesPayload> {
  const response = await fetch('/api/profile-panel/updates', { cache: 'no-store' })
  if (!response.ok) throw new Error(`updates request failed: ${response.status}`)
  return await response.json() as UpdatesPayload
}

/** F3: POST an update (an install with an explicit version). */
export async function postUpdate(body: {
  package: string
  spec?: string
  profiles?: string[]
}): Promise<InstallResponse> {
  const response = await fetch('/api/profile-panel/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json() as { error?: string }
      detail = parsed.error ?? ''
    } catch { /* non-json */ }
    throw new Error(detail || `update request failed: ${response.status}`)
  }
  return await response.json() as InstallResponse
}

/** F3: POST an align (same version across profiles). */
export async function postAlign(body: {
  package: string
  profiles: string[]
  version?: string
}): Promise<InstallResponse> {
  const response = await fetch('/api/profile-panel/align', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json() as { error?: string }
      detail = parsed.error ?? ''
    } catch { /* non-json */ }
    throw new Error(detail || `align request failed: ${response.status}`)
  }
  return await response.json() as InstallResponse
}

/** F6: read the profile health payload. */
export async function fetchHealth(): Promise<HealthPayload> {
  const response = await fetch('/api/profile-panel/health', { cache: 'no-store' })
  if (!response.ok) throw new Error(`health request failed: ${response.status}`)
  return await response.json() as HealthPayload
}

/** F7: diff two profiles. */
export async function fetchDiff(profiles: [string, string]): Promise<ProfileDiff> {
  const response = await fetch(`/api/profile-panel/diff?profiles=${encodeURIComponent(profiles[0])},${encodeURIComponent(profiles[1])}`, { cache: 'no-store' })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json() as { error?: string }
      detail = parsed.error ?? ''
    } catch { /* non-json */ }
    throw new Error(detail || `diff request failed: ${response.status}`)
  }
  return await response.json() as ProfileDiff
}

/** F10: read the audit timeline. */
export async function fetchAudit(limit = 50): Promise<AuditPayload> {
  const response = await fetch(`/api/profile-panel/audit?limit=${limit}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`audit request failed: ${response.status}`)
  return await response.json() as AuditPayload
}

/** F9: read the latest boot report. */
export async function fetchBootReport(): Promise<BootReportPayload> {
  const response = await fetch('/api/profile-panel/boot-report', { cache: 'no-store' })
  if (!response.ok) throw new Error(`boot-report request failed: ${response.status}`)
  return await response.json() as BootReportPayload
}

/** F12: hot-reload a pending, HMR-capable bundle. */
export async function postHotReload(body: { bundle: string }): Promise<{ ok: boolean }> {
  const response = await fetch('/api/profile-panel/hot-reload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json() as { error?: string }
      detail = parsed.error ?? ''
    } catch { /* non-json */ }
    throw new Error(detail || `hot-reload request failed: ${response.status}`)
  }
  return await response.json() as { ok: boolean }
}

/** F13: cancel a scheduled auto-restart. */
export async function postCancelRestart(cancelToken: string): Promise<{ cancelled: boolean }> {
  const response = await fetch('/api/profile-panel/cancel-restart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cancelToken }),
  })
  if (!response.ok) throw new Error(`cancel-restart request failed: ${response.status}`)
  return await response.json() as { cancelled: boolean }
}
