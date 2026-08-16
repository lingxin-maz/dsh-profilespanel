/**
 * F11 agent tools: model-facing `profile_status`, `profile_updates`,
 * `profile_sync_install`, and `profile_restart` over the same executors and
 * security gates the panel uses. `defineTool` is loaded lazily from the host
 * module table (`@deepseek-ai/dsh-tools`) — when the tool registry or the
 * module is missing, registration degrades to a no-op so plain-web hosts and
 * tool-less compositions keep working.
 */

import type { Context } from '@deepseek-ai/cordis'
import { validateInstallTarget, installIntoProfiles, listInstallableProfiles } from './install.ts'
import { collectUpdates } from './updates.ts'
import { detectDesktop, resolveInstallTargets, type DesktopPresence } from './desktop.ts'
import { appendAudit } from './audit.ts'
import type { PanelEventBus } from './events.ts'
import type { PanelState } from './routes.ts'
import type { RegistryView } from './registry.ts'

export interface PanelToolsDeps {
  ctx: Context
  state: PanelState
  profile: { name: string; dir: string }
  allowRestart: boolean
  registryView: (pkg: string) => Promise<RegistryView>
  events: PanelEventBus
  desktopPresence?: DesktopPresence
}

type DefineTool = (options: {
  name: string
  description?: string
  parameters?: Record<string, unknown>
  output: { schema: Record<string, unknown>; render: (args: unknown, value: unknown) => unknown }
  execute?: (...args: unknown[]) => unknown
  timeoutMs?: number
}) => unknown

/** Resolve the desktop presence once for the tools (injectable override). */
function presenceOf(deps: PanelToolsDeps): DesktopPresence {
  if (deps.desktopPresence !== undefined) return deps.desktopPresence
  const desktopProfiles = deps.ctx.get('desktopProfiles') as { current?: { name: string } } | undefined
  return detectDesktop({
    hasDesktopProfilesService: desktopProfiles !== undefined,
    currentDesktopName: desktopProfiles?.current?.name,
  })
}

/** Official authoring style: plain parameter records + a text renderer. */
const PARAM_TEXT = (description: string): Record<string, unknown> => ({
  type: 'string',
  description,
})

const PARAM_TEXT_REQUIRED = (description: string): Record<string, unknown> => ({
  type: 'string',
  required: true,
  description,
})

const PARAM_ARRAY = (description: string): Record<string, unknown> => ({
  type: 'array',
  items: { type: 'string' },
  description,
})

const OUTPUT_OBJECT = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
}

/** Build the four tool definitions (pure; testable without the host module). */
export function buildToolDefs(deps: PanelToolsDeps, defineTool: DefineTool): unknown[] {
  return [
    defineTool({
      name: 'profile_status',
      description: 'Read the plugin panel status: current profile, bundles, pending-restart states, restart availability.',
      parameters: {},
      output: OUTPUT_OBJECT,
      execute: async () => {
        const desktopRuntime = deps.ctx.get('desktopRuntime') as { requestRestart(): void } | undefined
        return {
          profileName: deps.profile.name,
          pendingRestart: deps.state.pendingRestart,
          changes: deps.state.changes,
          bundles: deps.state.boot?.bundles ?? [],
          profilesPending: deps.state.profilesPending.map(row => row.profile),
          restartAvailable: deps.allowRestart && desktopRuntime !== undefined && !deps.state.restarting,
          restarting: deps.state.restarting,
          desktopDetected: presenceOf(deps).detected,
        }
      },
    }),
    defineTool({
      name: 'profile_updates',
      description: 'Check installed plugin bundles for registry updates.',
      parameters: { profile: PARAM_TEXT('Profile name (default: the current profile)') },
      output: OUTPUT_OBJECT,
      execute: async (argsRaw) => {
        const args = (argsRaw ?? {}) as { profile?: string }
        const available = listInstallableProfiles(deps.ctx, deps.profile.name).profiles
        const target = args.profile !== undefined && args.profile !== ''
          ? available.find(profile => profile.name === args.profile)
          : available.find(profile => profile.name === deps.profile.name)
        if (target === undefined) {
          return { error: `unknown or non-web profile: ${args.profile ?? deps.profile.name}` }
        }
        return collectUpdates({
          profileDir: target.dir,
          profileName: target.name,
          registryView: deps.registryView,
        })
      },
    }),
    defineTool({
      name: 'profile_sync_install',
      description: 'Install one plugin into one or several profiles (single/dual/all modes). Accepts registry package names and github:owner/repo targets.',
      parameters: {
        package: PARAM_TEXT_REQUIRED('Registry package name (e.g. dshmarket) or github:owner/repo[#path:/sub] target'),
        spec: PARAM_TEXT('Optional version spec, e.g. 1.5.1 (npm targets only; default: pnpm resolves)'),
        profiles: PARAM_ARRAY('Optional explicit profile list (default: current profile)'),
        mode: PARAM_TEXT("Optional target mode: 'single' | 'dual' | 'all' (profiles wins when both are given)"),
      },
      output: OUTPUT_OBJECT,
      execute: async (argsRaw) => {
        const args = (argsRaw ?? {}) as {
          package?: string
          spec?: string
          profiles?: string[]
          mode?: 'single' | 'dual' | 'all'
        }
        if (deps.state.installing) {
          return { ok: false, error: 'another install is already running' }
        }
        const validated = validateInstallTarget(args.package, args.spec)
        if ('error' in validated) {
          return { ok: false, error: validated.error }
        }
        const available = listInstallableProfiles(deps.ctx, deps.profile.name).profiles
        const resolution = resolveInstallTargets({
          requested: args.profiles,
          mode: args.mode,
          currentName: deps.profile.name,
          presence: presenceOf(deps),
          available,
        })
        deps.state.installing = true
        deps.events.publish({ type: 'installing', package: validated.package })
        try {
          const outcome = await installIntoProfiles({
            request: {
              package: validated.package,
              ...(args.spec !== undefined ? { spec: args.spec } : {}),
              profiles: resolution.profiles,
            },
            ctx: deps.ctx,
            currentName: deps.profile.name,
          })
          deps.events.publish({ type: 'installed', package: validated.package, overallOk: outcome.overallOk })
          const byName = new Map(available.map(profile => [profile.name, profile]))
          for (const row of outcome.results) {
            const summary = byName.get(row.profile)
            if (summary !== undefined) {
              appendAudit(summary.dir, {
                action: 'install',
                profile: row.profile,
                package: validated.package,
                ...(args.spec !== undefined ? { spec: args.spec } : {}),
                ...(row.resolvedVersion != null ? { resolved: row.resolvedVersion } : {}),
                ok: row.ok,
                error: row.error ?? null,
              })
            }
          }
          return {
            ok: outcome.overallOk,
            results: outcome.results,
            rolledBackProfiles: outcome.rolledBackProfiles ?? [],
            warnings: resolution.warnings,
          }
        } finally {
          deps.state.installing = false
        }
      },
    }),
    defineTool({
      name: 'profile_restart',
      description: 'Restart the harness so pending plugin changes take effect.',
      parameters: {},
      output: OUTPUT_OBJECT,
      execute: async () => {
        if (!deps.allowRestart) {
          return { ok: false, error: 'self-restart is disabled for this host (allowRestart: false)' }
        }
        if (deps.state.restarting) {
          return { ok: false, error: 'restart already in progress' }
        }
        const desktopRuntime = deps.ctx.get('desktopRuntime') as { requestRestart(): void } | undefined
        if (desktopRuntime === undefined) {
          return { ok: false, hint: 'restart dsh web from the terminal to apply changes' }
        }
        deps.state.restarting = true
        deps.events.publish({ type: 'restarting' })
        appendAudit(deps.profile.dir, {
          action: 'restart',
          profile: deps.profile.name,
          ok: true,
          error: null,
        })
        setTimeout(() => {
          void Promise.resolve(desktopRuntime.requestRestart()).catch(() => {
            deps.state.restarting = false
          })
        }, 150)
        return { ok: true, restarting: true }
      },
    }),
  ]
}

/** Lazily load the host's `defineTool`; null when the module is unavailable. */
async function loadDefineTool(): Promise<DefineTool | null> {
  try {
    const mod = await import('@deepseek-ai/dsh-tools') as { defineTool?: DefineTool }
    return typeof mod.defineTool === 'function' ? mod.defineTool : null
  } catch {
    return null
  }
}

export interface ToolRegistryService {
  register(tool: unknown): unknown
}

/**
 * Register the panel tools when both the tool registry service and the host
 * `@deepseek-ai/dsh-tools` module are available; otherwise a silent no-op
 * (plain-web hosts keep working without the tools).
 */
export async function registerPanelTools(ctx: Context, deps: PanelToolsDeps): Promise<void> {
  const tools = ctx.get('tools') as ToolRegistryService | undefined
  if (tools === undefined) return
  const defineTool = await loadDefineTool()
  if (defineTool === null) return
  for (const tool of buildToolDefs(deps, defineTool)) {
    tools.register(tool)
  }
}
