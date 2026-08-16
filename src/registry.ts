/**
 * Registry metadata queries (F1): `pnpm view` wrappers with a TTL cache and
 * an injectable runner so unit tests never touch the network or spawn pnpm.
 * The version/timing helpers used by the install-preview assistant and the
 * F3 updates feed share this module.
 */

import { spawn } from 'node:child_process'
import { isExactSpec } from './install.ts'

/** Outcome of one `pnpm view` invocation (structural, injectable). */
export interface PnpmViewRun {
  exitCode: number | null
  stdout: string
  stderr: string
  /** True when the pnpm binary itself was missing. */
  missing?: boolean
}

export type PnpmViewRunner = (args: string[]) => Promise<PnpmViewRun>

export interface RegistryViewOk {
  ok: true
  package: string
  /** Latest dist-tag version, or null when the registry gave no answer. */
  latest: string | null
  /** Publish time of `latest` (falls back to created/modified). */
  publishedAt: string | null
  /** Raw `pnpm view <pkg> time --json` map. */
  timeMap: Record<string, string>
}

export interface RegistryViewFail {
  ok: false
  package: string
  code: 'network' | 'not-found'
  message: string
}

export type RegistryView = RegistryViewOk | RegistryViewFail

const VIEW_TIMEOUT_MS = Number(process.env.DSH_PROFILE_PANEL_VIEW_TIMEOUT_MS) || 30_000
const winCmdShim = process.platform === 'win32'

/** Run `pnpm view <args>` against the system pnpm (pure-web fallback). */
export function runPnpmView(args: string[]): Promise<PnpmViewRun> {
  return new Promise((resolvePromise) => {
    let settled = false
    const settle = (run: PnpmViewRun): void => {
      if (settled) return
      settled = true
      resolvePromise(run)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn('pnpm', args, {
        env: { ...process.env, CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: winCmdShim,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      settle({ exitCode: 127, stdout: '', stderr: message })
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
      settle({ exitCode: null, stdout, stderr: `${stderr}\nview timed out after ${VIEW_TIMEOUT_MS}ms` })
    }, VIEW_TIMEOUT_MS)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-256 * 1024)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-64 * 1024)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
      settle({
        exitCode: 127,
        stdout,
        stderr: missing ? 'pnpm not found on PATH' : error.message,
        missing,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      settle({ exitCode: code, stdout, stderr, missing: false })
    })
  })
}

/**
 * Query registry metadata for one package: dist-tag `latest` plus the
 * publish-time table. Failure degrades to a typed failure — never throws.
 */
export async function queryRegistry(packageName: string, runner: PnpmViewRunner = runPnpmView): Promise<RegistryView> {
  const versionRun = await runner(['view', packageName, 'version'])
  if (versionRun.exitCode !== 0) {
    return {
      ok: false,
      package: packageName,
      code: versionRun.missing === true ? 'network' : 'not-found',
      message: versionRun.missing === true
        ? 'pnpm not found on PATH — install pnpm to query the registry'
        : (versionRun.stderr.slice(-200) || `package not found: ${packageName}`),
    }
  }
  const lines = versionRun.stdout.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const latest = lines[lines.length - 1] ?? null
  let timeMap: Record<string, string> = {}
  const timeRun = await runner(['view', packageName, 'time', '--json'])
  if (timeRun.exitCode === 0) {
    try {
      const parsed = JSON.parse(timeRun.stdout) as unknown
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        timeMap = parsed as Record<string, string>
      }
    } catch { /* keep empty map */ }
  }
  const publishedAt = latest !== null
    ? (timeMap[latest] ?? timeMap.created ?? timeMap.modified ?? null)
    : null
  return { ok: true, package: packageName, latest, publishedAt, timeMap }
}

/** Whole days (floor) between a published timestamp and now; null when unknown. */
export function releaseAgeDays(publishedAt: string | null, now: number = Date.now()): number | null {
  if (publishedAt === null) return null
  const at = Date.parse(publishedAt)
  if (Number.isNaN(at)) return null
  return Math.max(0, Math.floor((now - at) / 86_400_000))
}

export interface PreviewWarning {
  code: 'release-age' | 'network' | 'not-found' | 'github-source'
  message: string
}

export interface InstallPreview {
  ok: boolean
  package: string
  spec: string | null
  /** 'npm' when the preview came from the registry, 'github' for repo targets. */
  source: 'npm' | 'github'
  latest: string | null
  publishedAt: string | null
  releaseAgeDays: number | null
  minimumReleaseAgeDays: number
  warnings: PreviewWarning[]
  suggestedPin: string | null
}

/** F17: preview for a GitHub install target — no registry version exists. */
export function buildGithubPreview(packageName: string, minimumReleaseAgeDays: number): InstallPreview {
  return {
    ok: true,
    package: packageName,
    spec: null,
    source: 'github',
    latest: null,
    publishedAt: null,
    releaseAgeDays: null,
    minimumReleaseAgeDays,
    warnings: [{
      code: 'github-source',
      message: '该插件来自 GitHub 仓库，将跟随仓库 HEAD 安装（无版本号可预览）',
    }],
    suggestedPin: null,
  }
}

/**
 * Build the install-preview payload from a registry view (F1). A registry
 * failure becomes a warning inside a 200-shaped payload — the assistant
 * never blocks an install on the network.
 */
export function buildInstallPreview(options: {
  view: RegistryView
  packageName: string
  spec?: string | null
  minimumReleaseAgeDays: number
  now?: number
}): InstallPreview {
  const { view, packageName, spec, minimumReleaseAgeDays, now } = options
  const specOrNull = spec ?? null
  if (!view.ok) {
    return {
      ok: false,
      package: packageName,
      spec: specOrNull,
      source: 'npm',
      latest: null,
      publishedAt: null,
      releaseAgeDays: null,
      minimumReleaseAgeDays,
      warnings: [{ code: view.code, message: view.message }],
      suggestedPin: null,
    }
  }
  const age = releaseAgeDays(view.publishedAt, now)
  const warnings: PreviewWarning[] = []
  if (age !== null && age < minimumReleaseAgeDays) {
    warnings.push({
      code: 'release-age',
      message: `latest ${view.latest ?? '?'} 发布于 ${age} 天前（不足 ${minimumReleaseAgeDays} 天时可能被策略降级）；建议显式 pin 版本`,
    })
  }
  const requestedExact = specOrNull !== null && isExactSpec(specOrNull)
  const suggestedPin = requestedExact ? null : view.latest
  return {
    ok: true,
    package: packageName,
    spec: specOrNull,
    source: 'npm',
    latest: view.latest,
    publishedAt: view.publishedAt,
    releaseAgeDays: age,
    minimumReleaseAgeDays,
    warnings,
    suggestedPin,
  }
}

/** TTL-cached registry viewer factory (shared by F1 preview and F3 updates). */
export function createRegistryCache(
  viewer: (pkg: string) => Promise<RegistryView>,
  ttlMs = 300_000,
): (pkg: string) => Promise<RegistryView> {
  const cache = new Map<string, { at: number; value: RegistryView }>()
  return async (pkg: string): Promise<RegistryView> => {
    const hit = cache.get(pkg)
    if (hit !== undefined && Date.now() - hit.at < ttlMs) return hit.value
    const value = await viewer(pkg)
    if (value.ok) cache.set(pkg, { at: Date.now(), value })
    return value
  }
}
