/**
 * HTTP routes bridging the settings panel UI to the host: status readout,
 * one-click restart, and multi-profile sync install. This layer only parses
 * requests, calls the service modules, and serializes responses.
 *
 * Security: mutating routes accept only direct same-origin loopback requests
 * (no forwarding headers), refuse while another operation runs, and
 * `allowRestart: false` disables self-restart for supervisor-managed hosts.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { readJsonBody, sameOrigin, sendJson, trustedLoopbackRequest } from './http.ts'
import {
  installIntoProfiles,
  listInstallableProfiles,
  undoProfile,
  validateInstallTarget,
  type InstallOutcome,
  type InstallRequest,
  type InstallRow,
} from './install.ts'
import { detectDesktop, resolveInstallTargets, desktopAppDataDir, readDesktopSelection, type DesktopPresence } from './desktop.ts'
import { buildInstallPreview, buildGithubPreview, type RegistryView } from './registry.ts'
import { alignAcrossProfiles, collectUpdates, updateIntoProfiles } from './updates.ts'
import { waitForNewerOrTimeout, type PanelEventBus } from './events.ts'
import type { ProfilePendingState } from './multi-watch.ts'
import { collectHealth } from './health.ts'
import { attributeBundle, isHotReloadable } from './attribution.ts'
import { diffProfiles } from './compare.ts'
import { appendAudit, readAudit } from './audit.ts'
import type { BootReportPayload } from './boot-report.ts'
import type { MarketSearchPayload } from './market.ts'
import {
  manifestBundles,
  manifestDeps,
  readProfileManifest,
  type BootSnapshot,
  type ProfileChanges,
  type ResolvedProfile,
} from './profile.ts'

export interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Desktop runtime surface the restart route drives (structural). */
export interface DesktopRuntimeService {
  requestRestart(): void | Promise<void>
}

export interface PanelConfig {
  profile: ResolvedProfile
  allowRestart: boolean
  minimumReleaseAgeDays: number
}

/** Shared mutable panel state, owned by the plugin fiber. */
export interface PanelState {
  boot: BootSnapshot | null
  pendingRestart: boolean
  changes: ProfileChanges | null
  restarting: boolean
  installing: boolean
  /** F5: pending-restart states of every watched profile (pending only). */
  profilesPending: ProfilePendingState[]
}

export interface PanelHost {
  ctx: Context
  webServer: WebServerService
  config: PanelConfig
  state: PanelState
  logger?: { warn(message: string): void }
  /** Registry metadata viewer (F1/F3); wired by the entry plugin. */
  registryView?: (pkg: string) => Promise<RegistryView>
  /** F17: market search service; wired by the entry plugin. */
  marketSearch?: (query: string, limit?: number) => Promise<MarketSearchPayload>
  /** Desktop presence override for tests; live hosts detect from ctx. */
  desktop?: DesktopPresence
  /** F4: event bus for the SSE stream / long-poll fallback. */
  events?: PanelEventBus
  /** F9: live boot-report reader (wired by the entry plugin). */
  readBootReport?: () => BootReportPayload
  /** F12: hot-reload executor override for tests; live hosts probe ctx. */
  hotReload?: (bundle: string) => { ok: boolean; reason?: string }
}

/** F13: countdown window before an auto-scheduled restart fires. */
const AUTO_RESTART_DELAY_MS = 5000

export type BundleState = 'loaded' | 'pending'

/** One bundle row with F8 attribution fields. */
export interface BundleStatusRow {
  name: string
  state: BundleState
  source?: 'inbox' | 'dependency' | 'patch'
  layerIndex?: number
  introducedBy?: string
  hotReloadable?: boolean
}

/** F16 desktop-end presence as exposed to the panel UI. */
export interface DesktopStatusPayload {
  detected: boolean
  reason: 'runtime' | 'profile' | 'app-data' | 'none'
  profile?: string
  appDataDir?: string
}

export interface StatusPayload {
  profileName: string
  profileDir: string
  profileExists: boolean
  manifestError?: string
  bundles: BundleStatusRow[]
  pendingRestart: boolean
  changes: ProfileChanges | null
  restart: {
    available: boolean
    restarting: boolean
    hint: string
  }
  profiles: Array<{
    name: string
    dir: string
    current: boolean
  }>
  desktop: DesktopStatusPayload
  minimumReleaseAgeDays: number
  profilesPending: ProfilePendingState[]
  /** F14: desktop app's active/lastKnownGood selection (desktop hosts only). */
  desktopSelection?: { active?: string; lastKnownGood?: string }
}

/** Build the GET /api/profile-panel/status payload. */
export function buildStatus(host: PanelHost): StatusPayload {
  const { config, state } = host
  let bundles: BundleStatusRow[] = []
  let manifestError: string | undefined
  let profileExists = true
  if (state.boot !== null) {
    const seen = new Set<string>()
    try {
      const manifest = readProfileManifest(config.profile.dir)
      const dependencies = manifestDeps(manifest)
      const disk = manifestBundles(manifest)
      const attr = (name: string, index: number) => attributeBundle({
        name,
        index,
        dependencies,
        profileDir: config.profile.dir,
      })
      for (const [index, name] of state.boot.bundles.entries()) {
        seen.add(name)
        const diskIndex = disk.indexOf(name)
        bundles.push({ name, state: 'loaded', ...attr(name, diskIndex === -1 ? index : diskIndex) })
      }
      for (const [index, name] of disk.entries()) {
        if (!seen.has(name)) bundles.push({ name, state: 'pending', ...attr(name, index) })
      }
    } catch (error) {
      manifestError = error instanceof Error ? error.message : String(error)
      profileExists = false
      bundles = state.boot.bundles.map(name => ({ name, state: 'loaded' }))
    }
  } else {
    profileExists = false
  }

  const desktopRuntime = host.ctx.get('desktopRuntime') as DesktopRuntimeService | undefined
  const available = config.allowRestart && desktopRuntime !== undefined && !state.restarting
  const hint = !config.allowRestart
    ? '此主机已禁用自动重启（allowRestart: false）— 请由托管方重启 / self-restart is disabled for this host (allowRestart: false)'
    : desktopRuntime === undefined
      ? '请在终端重启 dsh web 以应用变更 / restart dsh web from the terminal to apply changes'
      : ''

  const currentName = config.profile.name
  const profiles = listInstallableProfiles(host.ctx, currentName).profiles
    .map(profile => ({ name: profile.name, dir: profile.dir, current: profile.name === currentName }))

  // F16: desktop-end presence (overridable in tests, detected live otherwise).
  const desktopProfiles = host.ctx.get('desktopProfiles') as { current?: { name: string } } | undefined
  const presence = host.desktop ?? detectDesktop({
    hasDesktopProfilesService: desktopProfiles !== undefined,
    currentDesktopName: desktopProfiles?.current?.name,
  })
  const desktop: DesktopStatusPayload = {
    detected: presence.detected,
    reason: presence.reason,
    ...(presence.desktopProfile !== undefined ? { profile: presence.desktopProfile } : {}),
    ...(presence.appDataDir !== undefined ? { appDataDir: presence.appDataDir } : {}),
  }

  // F14: desktop app selection state (only meaningful on desktop hosts).
  let desktopSelection: StatusPayload['desktopSelection']
  if (desktopProfiles !== undefined) {
    desktopSelection = readDesktopSelection(desktopAppDataDir()) ?? undefined
  }

  return {
    profileName: config.profile.name,
    profileDir: config.profile.dir,
    profileExists,
    ...(manifestError !== undefined ? { manifestError } : {}),
    bundles,
    pendingRestart: state.pendingRestart,
    changes: state.changes,
    restart: { available, restarting: state.restarting, hint },
    profiles,
    desktop,
    minimumReleaseAgeDays: config.minimumReleaseAgeDays,
    profilesPending: state.profilesPending,
    ...(desktopSelection !== undefined ? { desktopSelection } : {}),
  }
}

/**
 * Register the panel's HTTP routes.
 * @returns disposer removing every registered route.
 */
export function mountPanelRoutes(host: PanelHost): () => void {
  let sseConnections = 0
  const SSE_MAX_CONNECTIONS = 8

  // F13: pending delayed auto-restarts keyed by their cancel token.
  const pendingAutoRestarts = new Map<string, ReturnType<typeof setTimeout>>()

  const scheduleAutoRestart = (): { scheduled: true; inMs: number; cancelToken: string } | { scheduled: false; reason: string } => {
    const desktopRuntime = host.ctx.get('desktopRuntime') as DesktopRuntimeService | undefined
    if (!host.config.allowRestart || desktopRuntime === undefined || host.state.restarting) {
      return { scheduled: false, reason: 'restart unavailable on this host' }
    }
    const cancelToken = randomUUID()
    const timer = setTimeout(() => {
      pendingAutoRestarts.delete(cancelToken)
      host.state.restarting = true
      host.events?.publish({ type: 'restarting' })
      appendAudit(host.config.profile.dir, {
        action: 'restart',
        profile: host.config.profile.name,
        ok: true,
        error: null,
      })
      void Promise.resolve(desktopRuntime.requestRestart()).catch(() => {
        host.state.restarting = false
      })
    }, AUTO_RESTART_DELAY_MS)
    pendingAutoRestarts.set(cancelToken, timer)
    return { scheduled: true, inMs: AUTO_RESTART_DELAY_MS, cancelToken }
  }

  // F10: write one audit entry per affected profile (best-effort).
  const recordAudit = (
    action: 'install' | 'update' | 'align',
    rows: InstallRow[],
    pkg: string,
    spec?: string,
  ): void => {
    const available = listInstallableProfiles(host.ctx, host.config.profile.name).profiles
    const byName = new Map(available.map(profile => [profile.name, profile]))
    for (const row of rows) {
      const summary = byName.get(row.profile)
      if (summary === undefined) continue
      appendAudit(summary.dir, {
        action,
        profile: row.profile,
        package: pkg,
        ...(spec !== undefined ? { spec } : {}),
        ...(row.resolvedVersion != null ? { resolved: row.resolvedVersion } : {}),
        ok: row.ok,
        error: row.error ?? null,
      })
    }
  }

  const disposers = [
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/status',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        sendJson(response, 200, buildStatus(host))
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/restart',
      handler: (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request) || !trustedLoopbackRequest(request)) {
          sendJson(response, 403, { error: 'restart is limited to same-origin loopback requests' })
          return
        }
        if (!host.config.allowRestart) {
          sendJson(response, 403, { error: 'self-restart is disabled for this host' })
          return
        }
        const desktopRuntime = host.ctx.get('desktopRuntime') as DesktopRuntimeService | undefined
        if (desktopRuntime === undefined) {
          sendJson(response, 501, {
            error: 'this host cannot restart itself',
            hint: '请在终端重启 dsh web 以应用变更 / restart dsh web from the terminal to apply changes',
          })
          return
        }
        if (host.state.restarting) {
          sendJson(response, 409, { error: 'restart already in progress' })
          return
        }
        if (host.state.installing) {
          sendJson(response, 409, { error: 'cannot restart while an install is running' })
          return
        }
        host.state.restarting = true
        // Respond first: the graceful dispose may tear the server down before
        // the response flushes otherwise (same handoff as dshmarket).
        sendJson(response, 202, { ok: true, restarting: true })
        host.events?.publish({ type: 'restarting' })
        appendAudit(host.config.profile.dir, {
          action: 'restart',
          profile: host.config.profile.name,
          ok: true,
          error: null,
        })
        setTimeout(() => {
          void Promise.resolve(desktopRuntime.requestRestart()).catch((error: unknown) => {
            host.state.restarting = false
            host.logger?.warn(`[dsh-profile-panel] restart failed: ${String(error)}`)
          })
        }, 150)
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/install',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request) || !trustedLoopbackRequest(request)) {
          sendJson(response, 403, { error: 'install is limited to same-origin loopback requests' })
          return
        }
        if (host.state.installing) {
          sendJson(response, 409, { error: 'another install is already running' })
          return
        }
        let body: unknown
        try {
          body = await readJsonBody(request)
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request body' })
          return
        }
        const candidate = (body ?? {}) as Record<string, unknown>
        const validated = validateInstallTarget(candidate.package, candidate.spec)
        if ('error' in validated) {
          sendJson(response, 400, { error: validated.error })
          return
        }
        let profiles: string[] | undefined
        if (candidate.profiles !== undefined) {
          if (!Array.isArray(candidate.profiles)
            || candidate.profiles.some(profile => typeof profile !== 'string')
            || candidate.profiles.length === 0) {
            sendJson(response, 400, { error: 'profiles must be a non-empty array of profile names' })
            return
          }
          profiles = candidate.profiles as string[]
          for (const profile of profiles) {
            if (!/^[A-Za-z0-9_-]+$/.test(profile)) {
              sendJson(response, 400, { error: `invalid profile name: ${profile}` })
              return
            }
          }
        }
        // F16: dual-end / all-profile mode selection.
        let mode: 'single' | 'dual' | 'all' | undefined
        if (candidate.mode !== undefined) {
          if (candidate.mode !== 'single' && candidate.mode !== 'dual' && candidate.mode !== 'all') {
            sendJson(response, 400, { error: 'mode must be single, dual, or all' })
            return
          }
          mode = candidate.mode
        }
        const rollback = candidate.rollback === true
        const preview = candidate.preview === true
        const available = listInstallableProfiles(host.ctx, host.config.profile.name).profiles
        const desktopProfiles = host.ctx.get('desktopProfiles') as { current?: { name: string } } | undefined
        const presence = host.desktop ?? detectDesktop({
          hasDesktopProfilesService: desktopProfiles !== undefined,
          currentDesktopName: desktopProfiles?.current?.name,
        })
        const resolution = resolveInstallTargets({
          requested: profiles,
          mode,
          currentName: host.config.profile.name,
          presence,
          available,
        })
        const warnings: Array<{ code: string; message: string }> = [...resolution.warnings]
        if (preview && validated.kind === 'github') {
          warnings.push(...buildGithubPreview(validated.package, host.config.minimumReleaseAgeDays).warnings)
        } else if (preview && host.registryView !== undefined) {
          const view = await host.registryView(validated.package)
          warnings.push(...buildInstallPreview({
            view,
            packageName: validated.package,
            spec: candidate.spec !== undefined ? String(candidate.spec) : null,
            minimumReleaseAgeDays: host.config.minimumReleaseAgeDays,
          }).warnings)
        } else if (preview) {
          warnings.push({ code: 'network', message: 'registry query unavailable on this host' })
        }
        const request2: InstallRequest = {
          package: validated.package,
          ...(candidate.spec !== undefined ? { spec: String(candidate.spec) } : {}),
          profiles: resolution.profiles,
        }
        host.state.installing = true
        host.events?.publish({ type: 'installing', package: validated.package })
        try {
          const outcome: InstallOutcome = await installIntoProfiles({
            request: request2,
            ctx: host.ctx,
            currentName: host.config.profile.name,
            rollback,
          })
          host.events?.publish({ type: 'installed', package: validated.package, overallOk: outcome.overallOk })
          recordAudit('install', outcome.results, validated.package, candidate.spec !== undefined ? String(candidate.spec) : undefined)
          // F13: schedule the auto-restart only when the install succeeded,
          // targeted the current profile alone, and restart is available.
          const autoRestartRequested = candidate.autoRestart === true
          const targetsCurrentOnly = resolution.profiles.length === 1
            && resolution.profiles[0] === host.config.profile.name
          let autoRestart: { scheduled: true; inMs: number; cancelToken: string } | undefined
          let autoRestartSkipped: boolean | undefined
          if (autoRestartRequested && outcome.overallOk) {
            if (targetsCurrentOnly) {
              const scheduled = scheduleAutoRestart()
              if (scheduled.scheduled) autoRestart = scheduled
              else autoRestartSkipped = true
            } else {
              autoRestartSkipped = true
            }
          }
          sendJson(response, 200, {
            ...outcome,
            ...(warnings.length > 0 ? { warnings } : {}),
            ...(autoRestart !== undefined ? { autoRestart } : {}),
            ...(autoRestartSkipped === true ? { autoRestartSkipped: true } : {}),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          host.logger?.warn(`[dsh-profile-panel] install failed: ${message}`)
          sendJson(response, 500, { error: message })
        } finally {
          host.state.installing = false
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/install-preview',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request) || !trustedLoopbackRequest(request)) {
          sendJson(response, 403, { error: 'preview is limited to same-origin loopback requests' })
          return
        }
        let body: unknown
        try {
          body = await readJsonBody(request)
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request body' })
          return
        }
        const candidate = (body ?? {}) as Record<string, unknown>
        const validated = validateInstallTarget(candidate.package, candidate.spec)
        if ('error' in validated) {
          sendJson(response, 400, { error: validated.error })
          return
        }
        if (validated.kind === 'github') {
          // F17: repo targets carry no registry version — preview the source.
          sendJson(response, 200, buildGithubPreview(validated.package, host.config.minimumReleaseAgeDays))
          return
        }
        if (host.registryView === undefined) {
          sendJson(response, 501, { error: 'registry query unavailable on this host' })
          return
        }
        const view = await host.registryView(validated.package)
        sendJson(response, 200, buildInstallPreview({
          view,
          packageName: validated.package,
          spec: candidate.spec !== undefined ? String(candidate.spec) : null,
          minimumReleaseAgeDays: host.config.minimumReleaseAgeDays,
        }))
      },
    }),

    // F17: market search — the same curated registry dshmarket browses.
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/market/search',
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        if (host.marketSearch === undefined) {
          sendJson(response, 501, { error: 'market search unavailable on this host' })
          return
        }
        const query = request.url !== undefined && request.url.includes('?')
          ? request.url.slice(request.url.indexOf('?') + 1)
          : ''
        const params = new URLSearchParams(query)
        const q = (params.get('q') ?? '').trim().slice(0, 80)
        const limitRaw = params.get('limit')
        const parsedLimit = limitRaw !== null ? Number.parseInt(limitRaw, 10) : 8
        const limit = Number.isFinite(parsedLimit) ? Math.min(20, Math.max(1, parsedLimit)) : 8
        sendJson(response, 200, await host.marketSearch(q, limit))
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/undo',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request) || !trustedLoopbackRequest(request)) {
          sendJson(response, 403, { error: 'undo is limited to same-origin loopback requests' })
          return
        }
        if (host.state.installing) {
          sendJson(response, 409, { error: 'cannot undo while an install is running' })
          return
        }
        let body: unknown
        try {
          body = await readJsonBody(request)
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request body' })
          return
        }
        const candidate = (body ?? {}) as Record<string, unknown>
        let profiles: string[] | undefined
        if (candidate.profiles !== undefined) {
          if (!Array.isArray(candidate.profiles)
            || candidate.profiles.some(profile => typeof profile !== 'string')
            || candidate.profiles.length === 0) {
            sendJson(response, 400, { error: 'profiles must be a non-empty array of profile names' })
            return
          }
          profiles = candidate.profiles as string[]
          for (const profile of profiles) {
            if (!/^[A-Za-z0-9_-]+$/.test(profile)) {
              sendJson(response, 400, { error: `invalid profile name: ${profile}` })
              return
            }
          }
        }
        const currentName = host.config.profile.name
        const names = profiles ?? [currentName]
        const available = listInstallableProfiles(host.ctx, currentName).profiles
        const byName = new Map(available.map(profile => [profile.name, profile]))
        const results = []
        for (const name of names) {
          const summary = byName.get(name)
          if (summary === undefined) {
            results.push({ profile: name, ok: false, error: `unknown or non-web profile: ${name}` })
            continue
          }
          results.push(undoProfile(summary.dir, name))
        }
        for (const row of results) {
          const summary = byName.get(row.profile)
          if (summary !== undefined) {
            appendAudit(summary.dir, { action: 'undo', profile: row.profile, ok: row.ok, error: row.error ?? null })
          }
        }
        sendJson(response, 200, { ok: results.every(row => row.ok), results })
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/updates',
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        if (host.registryView === undefined) {
          sendJson(response, 501, { error: 'registry query unavailable on this host' })
          return
        }
        const query = request.url !== undefined && request.url.includes('?')
          ? request.url.slice(request.url.indexOf('?') + 1)
          : ''
        const params = new URLSearchParams(query)
        const requested = params.get('profile')
        const currentName = host.config.profile.name
        const available = listInstallableProfiles(host.ctx, currentName).profiles
        const target = requested !== null && requested !== ''
          ? available.find(profile => profile.name === requested)
          : available.find(profile => profile.name === currentName)
        if (target === undefined) {
          sendJson(response, 404, { error: `unknown or non-web profile: ${requested ?? currentName}` })
          return
        }
        sendJson(response, 200, await collectUpdates({
          profileDir: target.dir,
          profileName: target.name,
          registryView: host.registryView,
        }))
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/update',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request) || !trustedLoopbackRequest(request)) {
          sendJson(response, 403, { error: 'update is limited to same-origin loopback requests' })
          return
        }
        if (host.state.installing) {
          sendJson(response, 409, { error: 'another install is already running' })
          return
        }
        let body: unknown
        try {
          body = await readJsonBody(request)
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request body' })
          return
        }
        const candidate = (body ?? {}) as Record<string, unknown>
        const validated = validateInstallTarget(candidate.package, candidate.spec)
        if ('error' in validated) {
          sendJson(response, 400, { error: validated.error })
          return
        }
        let profiles: string[] | undefined
        if (candidate.profiles !== undefined) {
          if (!Array.isArray(candidate.profiles) || candidate.profiles.some(profile => typeof profile !== 'string')) {
            sendJson(response, 400, { error: 'profiles must be an array of profile names' })
            return
          }
          profiles = candidate.profiles as string[]
        }
        host.state.installing = true
        host.events?.publish({ type: 'installing', package: validated.package })
        try {
          const outcome = await updateIntoProfiles({
            request: {
              package: validated.package,
              ...(candidate.spec !== undefined ? { spec: String(candidate.spec) } : {}),
              ...(profiles !== undefined ? { profiles } : {}),
            },
            ctx: host.ctx,
            currentName: host.config.profile.name,
          })
          host.events?.publish({ type: 'installed', package: validated.package, overallOk: outcome.overallOk })
          recordAudit('update', outcome.results, validated.package, candidate.spec !== undefined ? String(candidate.spec) : undefined)
          sendJson(response, 200, outcome)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          host.logger?.warn(`[dsh-profile-panel] update failed: ${message}`)
          sendJson(response, 500, { error: message })
        } finally {
          host.state.installing = false
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/align',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request) || !trustedLoopbackRequest(request)) {
          sendJson(response, 403, { error: 'align is limited to same-origin loopback requests' })
          return
        }
        if (host.state.installing) {
          sendJson(response, 409, { error: 'another install is already running' })
          return
        }
        let body: unknown
        try {
          body = await readJsonBody(request)
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request body' })
          return
        }
        const candidate = (body ?? {}) as Record<string, unknown>
        const validated = validateInstallTarget(candidate.package, candidate.version)
        if ('error' in validated) {
          sendJson(response, 400, { error: validated.error })
          return
        }
        if (!Array.isArray(candidate.profiles)
          || candidate.profiles.length === 0
          || candidate.profiles.some(profile => typeof profile !== 'string')) {
          sendJson(response, 400, { error: 'profiles must be a non-empty array of profile names' })
          return
        }
        if (host.registryView === undefined) {
          sendJson(response, 501, { error: 'registry query unavailable on this host' })
          return
        }
        host.state.installing = true
        host.events?.publish({ type: 'installing', package: validated.package })
        try {
          const outcome = await alignAcrossProfiles({
            request: {
              package: validated.package,
              profiles: candidate.profiles as string[],
              ...(candidate.version !== undefined ? { version: String(candidate.version) } : {}),
            },
            ctx: host.ctx,
            currentName: host.config.profile.name,
            registryView: host.registryView,
          })
          if ('error' in outcome) {
            sendJson(response, 400, { error: outcome.error })
          } else {
            host.events?.publish({ type: 'installed', package: validated.package, overallOk: outcome.overallOk })
            recordAudit('align', outcome.results, validated.package, candidate.version !== undefined ? String(candidate.version) : undefined)
            sendJson(response, 200, outcome)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          host.logger?.warn(`[dsh-profile-panel] align failed: ${message}`)
          sendJson(response, 500, { error: message })
        } finally {
          host.state.installing = false
        }
      },
    }),

    // F6: profile health + next-boot bundle preview.
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/health',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        const query = request.url !== undefined && request.url.includes('?')
          ? request.url.slice(request.url.indexOf('?') + 1)
          : ''
        const requested = new URLSearchParams(query).get('profile')
        const currentName = host.config.profile.name
        const available = listInstallableProfiles(host.ctx, currentName).profiles
        const target = requested !== null && requested !== ''
          ? available.find(profile => profile.name === requested)
          : available.find(profile => profile.name === currentName)
        if (target === undefined) {
          sendJson(response, 404, { error: `unknown or non-web profile: ${requested ?? currentName}` })
          return
        }
        sendJson(response, 200, collectHealth(target.dir, target.name))
      },
    }),

    // F7: side-by-side bundle diff between two profiles.
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/diff',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        const query = request.url !== undefined && request.url.includes('?')
          ? request.url.slice(request.url.indexOf('?') + 1)
          : ''
        const raw = new URLSearchParams(query).get('profiles')
        const names = raw !== null ? raw.split(',').map(name => name.trim()).filter(Boolean) : []
        if (names.length !== 2) {
          sendJson(response, 400, { error: 'profiles must name exactly two profiles, e.g. ?profiles=desktop,web' })
          return
        }
        const currentName = host.config.profile.name
        const available = listInstallableProfiles(host.ctx, currentName).profiles
        const byName = new Map(available.map(profile => [profile.name, profile]))
        const a = byName.get(names[0]!)
        const b = byName.get(names[1]!)
        if (a === undefined || b === undefined) {
          sendJson(response, 400, { error: `unknown or non-web profile: ${names[0]}, ${names[1]}` })
          return
        }
        sendJson(response, 200, diffProfiles({
          a: { name: a.name, dir: a.dir },
          b: { name: b.name, dir: b.dir },
        }))
      },
    }),

    // F12: hot-reload a pending, HMR-capable bundle without a restart.
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/hot-reload',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request) || !trustedLoopbackRequest(request)) {
          sendJson(response, 403, { error: 'hot-reload is limited to same-origin loopback requests' })
          return
        }
        if (host.state.installing) {
          sendJson(response, 409, { error: 'cannot hot-reload while an install is running' })
          return
        }
        let body: unknown
        try {
          body = await readJsonBody(request)
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request body' })
          return
        }
        const candidate = (body ?? {}) as Record<string, unknown>
        const bundle = typeof candidate.bundle === 'string' ? candidate.bundle : ''
        if (!/^(@[A-Za-z0-9-~][A-Za-z0-9._~-]*\/)?[A-Za-z0-9-~][A-Za-z0-9._~-]*$/.test(bundle)) {
          sendJson(response, 400, { error: 'invalid bundle name' })
          return
        }
        if (!isHotReloadable(host.config.profile.dir, bundle)) {
          sendJson(response, 501, { error: `bundle ${bundle} does not declare hot-reload capability — restart instead` })
          return
        }
        if (host.hotReload !== undefined) {
          const result = host.hotReload(bundle)
          if (result.ok) sendJson(response, 200, { ok: true })
          else sendJson(response, 501, { error: result.reason ?? 'hot reload unavailable' })
          return
        }
        const hmr = host.ctx.get('hmr') as { reload?(entry: string): unknown; hot?(entry: string): unknown } | undefined
        const reload = hmr?.reload ?? hmr?.hot
        if (reload === undefined) {
          sendJson(response, 501, { error: 'hot reload unavailable on this host — restart instead' })
          return
        }
        try {
          reload(bundle)
          sendJson(response, 200, { ok: true })
        } catch (error) {
          sendJson(response, 501, { error: `hot reload failed: ${String(error)} — restart instead` })
        }
      },
    }),

    // F13: cancel a scheduled auto-restart before it fires.
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/cancel-restart',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request) || !trustedLoopbackRequest(request)) {
          sendJson(response, 403, { error: 'cancel-restart is limited to same-origin loopback requests' })
          return
        }
        let body: unknown
        try {
          body = await readJsonBody(request)
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request body' })
          return
        }
        const candidate = (body ?? {}) as Record<string, unknown>
        const token = typeof candidate.cancelToken === 'string' ? candidate.cancelToken : undefined
        if (token === undefined) {
          sendJson(response, 400, { error: 'cancelToken is required' })
          return
        }
        const timer = pendingAutoRestarts.get(token)
        if (timer === undefined) {
          sendJson(response, 200, { cancelled: false })
          return
        }
        clearTimeout(timer)
        pendingAutoRestarts.delete(token)
        sendJson(response, 200, { cancelled: true })
      },
    }),

    // F10: audit timeline readout (current profile's local JSONL).
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/audit',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        const query = request.url !== undefined && request.url.includes('?')
          ? request.url.slice(request.url.indexOf('?') + 1)
          : ''
        const params = new URLSearchParams(query)
        const limitRaw = params.get('limit')
        const offsetRaw = params.get('offset')
        const limit = limitRaw !== null ? Number.parseInt(limitRaw, 10) || 50 : 50
        const offset = offsetRaw !== null ? Number.parseInt(offsetRaw, 10) || 0 : 0
        sendJson(response, 200, readAudit(host.config.profile.dir, limit, offset))
      },
    }),

    // F9: the latest boot's loader projection (live read).
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/boot-report',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        if (host.readBootReport === undefined) {
          sendJson(response, 501, { error: 'boot report unavailable on this host' })
          return
        }
        let payload: BootReportPayload
        try {
          payload = host.readBootReport()
        } catch (error) {
          sendJson(response, 500, {
            error: error instanceof Error ? error.message : String(error),
          })
          return
        }
        sendJson(response, 200, payload)
      },
    }),

    // F4: SSE stream + long-poll fallback sharing one event bus.
    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/events',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        const bus = host.events
        if (bus === undefined) {
          sendJson(response, 501, { error: 'events unavailable on this host' })
          return
        }
        if (sseConnections >= SSE_MAX_CONNECTIONS) {
          sendJson(response, 503, { error: 'too many event connections' })
          return
        }
        sseConnections += 1
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        })
        if (typeof response.flushHeaders === 'function') response.flushHeaders()
        const unsubscribe = bus.subscribe((event) => {
          try {
            response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
          } catch { /* connection already closed */ }
        })
        const heartbeat = setInterval(() => {
          try {
            response.write(': ping\n\n')
          } catch { /* connection already closed */ }
        }, 30_000)
        heartbeat.unref?.()
        const cleanup = (): void => {
          clearInterval(heartbeat)
          unsubscribe()
          sseConnections -= 1
        }
        request.on('close', cleanup)
        response.on('close', cleanup)
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/api/profile-panel/poll',
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        const bus = host.events
        if (bus === undefined) {
          sendJson(response, 501, { error: 'events unavailable on this host' })
          return
        }
        const query = request.url !== undefined && request.url.includes('?')
          ? request.url.slice(request.url.indexOf('?') + 1)
          : ''
        const sinceRaw = new URLSearchParams(query).get('since')
        const since = sinceRaw !== null ? Number.parseInt(sinceRaw, 10) || 0 : 0
        await waitForNewerOrTimeout(bus, since, 25_000)
        sendJson(response, 200, { seq: bus.lastSeq(), status: buildStatus(host) })
      },
    }),
  ]

  return () => {
    for (const dispose of disposers) dispose()
  }
}
