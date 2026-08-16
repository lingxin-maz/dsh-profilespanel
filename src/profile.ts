/**
 * Profile location, boot snapshot, and disk-state comparison — everything the
 * panel learns from the profile directory (manifest, bundle list, tracked
 * file stats). Pure functions of explicit inputs wherever possible so the
 * decision logic stays unit-testable without touching the real host.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Profile identity fixed for one host generation (desktop service shape). */
export interface DesktopCurrentProfile {
  readonly name: string
  readonly dir: string
}

/** One discovered profile as offered to the sync-install section. */
export interface ProfileSummary {
  name: string
  dir: string
  /** Whether the profile can back a Web surface (desktop verdict when available). */
  webCapable: boolean
  /** Non-empty when the launcher refuses this profile for desktop use. */
  problem?: string
}

/** Profile identity + location resolved at boot. */
export interface ResolvedProfile {
  name: string
  dir: string
  /** True when the identity came from the desktop launcher service. */
  desktop: boolean
}

export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Resolve a profile name to its directory under DSH_HOME (default ~/.dsh). */
export function profileDir(profile: string): string {
  return join(dshHome(), 'profiles', profile)
}

/** The profile this host process actually booted (`--profile <name>` on argv). */
export function argvProfile(argv: string[] = process.argv): string | undefined {
  const flag = argv.indexOf('--profile')
  if (flag === -1 || flag + 1 >= argv.length) return undefined
  const value = argv[flag + 1]
  if (value === undefined || value.startsWith('-')) return undefined
  return value
}

/**
 * Resolve the panel's target profile. Priority (high to low):
 * 1. `ctx.desktopProfiles.current` (desktop launcher) — fixing dshmarket's
 *    defect of defaulting a desktop host to `web`;
 * 2. `--profile <name>` on the CLI invocation;
 * 3. an explicit configuration override;
 * 4. `web`.
 *
 * The configuration override is checked before the argv fallback so operators
 * can pin a profile even on hosts whose argv is managed by a supervisor.
 */
export function resolveProfile(options: {
  configured?: string
  argv?: string[]
  desktop?: DesktopCurrentProfile | undefined
}): ResolvedProfile {
  if (options.desktop !== undefined) {
    return { name: options.desktop.name, dir: options.desktop.dir, desktop: true }
  }
  const fromArgv = argvProfile(options.argv)
  const name = options.configured?.trim() ? options.configured.trim() : (fromArgv ?? 'web')
  return { name, dir: profileDir(name), desktop: false }
}

const PROFILE_NAME_RE = /^[A-Za-z0-9_-]+$/

/** Validate a profile name before it touches the filesystem. */
export function validProfileName(name: string): boolean {
  return PROFILE_NAME_RE.test(name) && name !== '.' && name !== '..' && name !== 'node_modules'
}

export interface ProfileManifest {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

/**
 * Read a profile manifest; throws a descriptive error when missing or broken
 * (the panel surfaces it instead of crashing the host).
 */
export function readProfileManifest(dir: string): ProfileManifest {
  const path = join(dir, 'package.json')
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`dsh-profile-panel: failed to read profile manifest ${path}: ${String(error)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`dsh-profile-panel: profile manifest ${path} is not valid JSON: ${String(error)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`dsh-profile-panel: profile manifest ${path} must hold a JSON object`)
  }
  return parsed as ProfileManifest
}

/** Read a manifest or return null (unreadable profiles degrade, never throw). */
export function tryReadProfileManifest(dir: string): ProfileManifest | null {
  try {
    return readProfileManifest(dir)
  } catch {
    return null
  }
}

/** Write a profile manifest back (2-space JSON, trailing newline). */
export function writeProfileManifest(dir: string, manifest: ProfileManifest): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
}

/** Order-sensitive bundle layer list of a manifest. */
export function manifestBundles(manifest: ProfileManifest): string[] {
  return [...(manifest.dsh?.profile?.bundles ?? [])]
}

/** Dependency map of a manifest. */
export function manifestDeps(manifest: ProfileManifest): Record<string, string> {
  return { ...(manifest.dependencies ?? {}) }
}

/** Boot-frozen facts the change detector compares the disk against. */
export interface BootSnapshot {
  profileName: string
  profileDir: string
  bundles: string[]
  dependencies: Record<string, string>
  /** mtimeMs+size of each tracked file at boot (missing files are absent). */
  files: Map<string, FileStamp>
}

export interface FileStamp {
  mtimeMs: number
  size: number
}

/** Files whose mutation signals "installed something since boot". */
export const TRACKED_FILES = ['package.json', 'pnpm-lock.yaml', 'node_modules/.modules.yaml'] as const

/** Stat one tracked file (relative to the profile dir), or null when absent. */
export function statTrackedFile(dir: string, relative: string): FileStamp | null {
  try {
    const stat = statSync(join(dir, relative))
    return { mtimeMs: stat.mtimeMs, size: stat.size }
  } catch {
    return null
  }
}

/** Capture the boot snapshot of a profile directory. */
export function snapshotProfile(profile: ResolvedProfile): BootSnapshot {
  const manifest = readProfileManifest(profile.dir)
  const files = new Map<string, FileStamp>()
  for (const file of TRACKED_FILES) {
    const stamp = statTrackedFile(profile.dir, file)
    if (stamp !== null) files.set(file, stamp)
  }
  return {
    profileName: profile.name,
    profileDir: profile.dir,
    bundles: manifestBundles(manifest),
    dependencies: manifestDeps(manifest),
    files,
  }
}

/** What changed between the boot snapshot and the disk right now. */
export interface ProfileChanges {
  changedFiles: string[]
  addedBundles: string[]
  removedBundles: string[]
}

export interface DiskState {
  bundles: string[]
  dependencies: Record<string, string>
  files: Map<string, FileStamp>
}

/** Read the current disk state of a profile directory. */
export function readDiskState(dir: string): DiskState {
  const manifest = readProfileManifest(dir)
  const files = new Map<string, FileStamp>()
  for (const file of TRACKED_FILES) {
    const stamp = statTrackedFile(dir, file)
    if (stamp !== null) files.set(file, stamp)
  }
  return { bundles: manifestBundles(manifest), dependencies: manifestDeps(manifest), files }
}

/** Whether two order-sensitive bundle lists differ. */
function bundlesDiffer(boot: string[], disk: string[]): boolean {
  return boot.length !== disk.length || boot.some((value, index) => value !== disk[index])
}

function depsDiffer(boot: Record<string, string>, disk: Record<string, string>): boolean {
  const bootKeys = Object.keys(boot)
  const diskKeys = Object.keys(disk)
  if (bootKeys.length !== diskKeys.length) return true
  for (const key of bootKeys) if (disk[key] !== boot[key]) return true
  return false
}

function fileStampsDiffer(
  boot: Map<string, FileStamp>,
  disk: Map<string, FileStamp>,
): string[] {
  const changed: string[] = []
  for (const file of TRACKED_FILES) {
    const before = boot.get(file)
    const after = disk.get(file)
    if (before === undefined && after === undefined) continue
    if (before === undefined || after === undefined
      || before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
      changed.push(file)
    }
  }
  return changed
}

/**
 * Compare a disk state against the boot snapshot. Returns the change report
 * when a restart is required, null when the profile matches the boot.
 *
 * Triggers: bundle list or dependency map changed, or the lockfile /
 * `.modules.yaml` moved (a dependency update under the same range). A
 * package.json rewrite without semantic change is cosmetic and ignored.
 */
export function computeChanges(boot: BootSnapshot, disk: DiskState): ProfileChanges | null {
  const changedFiles = fileStampsDiffer(boot.files, disk.files)
  const manifestChanged = bundlesDiffer(boot.bundles, disk.bundles) || depsDiffer(boot.dependencies, disk.dependencies)
  const addedBundles = disk.bundles.filter(name => !boot.bundles.includes(name))
  const removedBundles = boot.bundles.filter(name => !disk.bundles.includes(name))
  if (manifestChanged) return { changedFiles, addedBundles, removedBundles }
  if (changedFiles.some(file => file !== 'package.json')) return { changedFiles, addedBundles, removedBundles }
  return null
}

/** Every profile directory under $DSH_HOME/profiles (minus node_modules). */
export function discoverProfiles(home: string = dshHome()): ProfileSummary[] {
  const root = join(home, 'profiles')
  let entries: string[]
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
      .map(dirent => dirent.name)
  } catch {
    return []
  }
  const summaries: ProfileSummary[] = []
  for (const name of entries) {
    if (!validProfileName(name)) continue
    const dir = join(root, name)
    const manifest = tryReadProfileManifest(dir)
    if (manifest === null) continue
    summaries.push({
      name,
      dir,
      // Plain scan cannot prove web capability — mark capable when the base
      // bundle precedes the web bundle (mirror of the launcher's rule).
      webCapable: webCapableFromBundles(manifestBundles(manifest)),
    })
  }
  return summaries
}

/** Launcher-compatible web-capability verdict from a manifest's bundle order. */
export function webCapableFromBundles(bundles: string[]): boolean {
  const base = bundles.indexOf('@deepseek-ai/dsh-base')
  const web = bundles.indexOf('@deepseek-ai/dsh-web-app')
  return base !== -1 && web > base
}

/** The installed version of a package inside a profile, or null. */
export function readInstalledVersion(dir: string, name: string): string | null {
  const candidates = [
    join(dir, 'node_modules', name, 'package.json'),
  ]
  try {
    const files = readdirSync(join(dir, 'node_modules', '.pnpm'), { withFileTypes: true })
    for (const file of files) {
      if (file.isDirectory() && file.name.startsWith(name.replace('/', '+') + '@')) {
        candidates.push(join(dir, 'node_modules', '.pnpm', file.name, 'node_modules', name, 'package.json'))
      }
    }
  } catch { /* no .pnpm layout — hoisted linker only */ }
  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string }
      if (typeof manifest.version === 'string') return manifest.version
    } catch { /* keep looking */ }
  }
  return null
}

/** Whether a package physically present in the profile declares dsh.bundle. */
export function declaresBundlePatch(dir: string, name: string): boolean {
  const path = join(dir, 'node_modules', name, 'package.json')
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dsh?: { bundle?: { patch?: unknown } } }
    return manifest.dsh?.bundle?.patch !== undefined
  } catch {
    return false
  }
}

/** True when the profile directory exists at all. */
export function profileExists(dir: string): boolean {
  return existsSync(join(dir, 'package.json'))
}
