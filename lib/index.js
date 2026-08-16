/**
 * dsh-profile-panel host entry: resolve the boot profile, freeze a boot
 * snapshot, watch the profile directory for post-boot plugin changes, and
 * mount the panel's HTTP routes once the composition provides webServer.
 */
import z from '@deepseek-ai/schemastery';
import { resolveProfile, snapshotProfile, } from './profile.js';
import { createProfileWatcher } from './watcher.js';
import { createMultiProfileWatcher } from './multi-watch.js';
import { createPanelEventBus } from './events.js';
import { listInstallableProfiles } from './install.js';
import { createRegistryCache, queryRegistry } from './registry.js';
import { createMarketService } from './market.js';
import { readLoaderEntries } from './boot-report.js';
import { registerPanelTools } from './tools.js';
import { mountPanelRoutes } from './routes.js';
export const name = 'dsh-profile-panel';
/** Optional cordis.yml configuration; the profile is auto-resolved when absent. */
export const Config = z.object({
    profile: z.string(),
    allowRestart: z.boolean().default(true),
    pollIntervalMs: z.number().step(1).min(1000).default(5000),
    minimumReleaseAgeDays: z.number().step(1).min(0).default(7),
});
/**
 * Apply the plugin: profile resolution + boot snapshot + watcher on the root
 * fiber, HTTP routes gated on webServer/loader availability. Services are
 * acquired inside handlers via `ctx.get` so plain `dsh web` (no desktop
 * services) degrades gracefully instead of failing activation.
 */
export function apply(ctx, config) {
    const desktop = ctx.get('desktopProfiles');
    const resolved = {
        profile: resolveProfile({
            configured: config?.profile ?? undefined,
            argv: process.argv,
            desktop: desktop?.current,
        }),
        allowRestart: config?.allowRestart ?? true,
        pollIntervalMs: config?.pollIntervalMs ?? 5000,
        minimumReleaseAgeDays: config?.minimumReleaseAgeDays ?? 7,
    };
    // Boot snapshot: null when the profile manifest is unreadable — the panel
    // then renders the error state instead of crashing the host.
    let boot = null;
    try {
        boot = snapshotProfile(resolved.profile);
    }
    catch {
        boot = null;
    }
    const events = createPanelEventBus();
    const state = {
        boot,
        pendingRestart: false,
        changes: null,
        restarting: false,
        installing: false,
        profilesPending: [],
    };
    if (boot !== null) {
        ctx.effect(() => {
            const watcher = createProfileWatcher({
                profileDir: resolved.profile.dir,
                boot,
                pollIntervalMs: resolved.pollIntervalMs,
                debounceMs: 500,
                onPending: (changes) => {
                    state.pendingRestart = true;
                    state.changes = changes;
                    events.publish({ type: 'pending', profile: resolved.profile.name, changes });
                },
                onClean: () => {
                    state.pendingRestart = false;
                    state.changes = null;
                    events.publish({ type: 'clean', profile: resolved.profile.name });
                },
            });
            return () => watcher.dispose();
        }, 'dsh-profile-panel: profile change watcher');
    }
    // F5: watch every webCapable profile so pending-restart states of other
    // profiles surface in the panel and drive the event stream.
    ctx.effect(() => {
        const profiles = listInstallableProfiles(ctx, resolved.profile.name).profiles;
        let last = [];
        const multi = createMultiProfileWatcher({
            profiles,
            pollIntervalMs: resolved.pollIntervalMs,
            debounceMs: 500,
            onChange: (states) => {
                const byName = new Map(states.map(state => [state.profile, state]));
                for (const previous of last) {
                    if (!byName.has(previous.profile))
                        events.publish({ type: 'clean', profile: previous.profile });
                }
                for (const next of states) {
                    const previous = last.find(state => state.profile === next.profile);
                    if (previous === undefined || previous.pendingRestart !== next.pendingRestart) {
                        events.publish({
                            type: next.pendingRestart ? 'pending' : 'clean',
                            profile: next.profile,
                            changes: next.changes,
                        });
                    }
                }
                last = states;
                state.profilesPending = states;
            },
        });
        return () => multi.dispose();
    }, 'dsh-profile-panel: multi-profile watcher');
    // F1/F3: TTL-cached registry metadata viewer shared by install-preview
    // and the updates feed. Created lazily per apply so tests stay hermetic.
    const registryView = createRegistryCache(pkg => queryRegistry(pkg));
    // F17: market search over the curated registry (live with dshmarket
    // snapshot fallback). Profile dirs resolve lazily per fetch.
    const marketSearch = createMarketService({
        profileDirs: () => {
            const dirs = listInstallableProfiles(ctx, resolved.profile.name).profiles.map(profile => profile.dir);
            return [resolved.profile.dir, ...dirs.filter(dir => dir !== resolved.profile.dir)];
        },
    });
    // F9: live boot-report reader over the official loader projection.
    const bootedAt = new Date().toISOString();
    const readBootReport = () => ({
        bootedAt,
        entries: readLoaderEntries(ctx.get('loader')),
    });
    // F11: model-facing tools (silent no-op without a tool registry/module).
    const toolsDeps = {
        ctx,
        state,
        profile: { name: resolved.profile.name, dir: resolved.profile.dir },
        allowRestart: resolved.allowRestart,
        registryView,
        events,
    };
    void registerPanelTools(ctx, toolsDeps);
    ctx.inject(['webServer', 'loader'], (hostCtx) => {
        const host = hostCtx;
        host.effect(() => mountPanelRoutes({
            ctx,
            webServer: host.webServer,
            config: {
                profile: resolved.profile,
                allowRestart: resolved.allowRestart,
                minimumReleaseAgeDays: resolved.minimumReleaseAgeDays,
            },
            state,
            logger: ctx.logger,
            registryView,
            marketSearch: marketSearch.search,
            events,
            readBootReport,
        }), 'dsh-profile-panel: http routes');
    });
}
