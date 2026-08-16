/**
 * dsh-profile-panel host entry: resolve the boot profile, freeze a boot
 * snapshot, watch the profile directory for post-boot plugin changes, and
 * mount the panel's HTTP routes once the composition provides webServer.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type ResolvedProfile } from './profile.ts';
export declare const name = "dsh-profile-panel";
/** Optional cordis.yml configuration; the profile is auto-resolved when absent. */
export declare const Config: z<Schemastery.ObjectS<{
    profile: z<string, string>;
    allowRestart: z<boolean, boolean>;
    pollIntervalMs: z<number, number>;
    minimumReleaseAgeDays: z<number, number>;
}>, Schemastery.ObjectT<{
    profile: z<string, string>;
    allowRestart: z<boolean, boolean>;
    pollIntervalMs: z<number, number>;
    minimumReleaseAgeDays: z<number, number>;
}>>;
export interface PanelConfig {
    profile?: string;
    allowRestart?: boolean;
    pollIntervalMs?: number;
    minimumReleaseAgeDays?: number;
}
export interface PanelConfigResolved {
    profile: ResolvedProfile;
    allowRestart: boolean;
    pollIntervalMs: number;
    minimumReleaseAgeDays: number;
}
/**
 * Apply the plugin: profile resolution + boot snapshot + watcher on the root
 * fiber, HTTP routes gated on webServer/loader availability. Services are
 * acquired inside handlers via `ctx.get` so plain `dsh web` (no desktop
 * services) degrades gracefully instead of failing activation.
 */
export declare function apply(ctx: Context, config?: PanelConfig): void;
//# sourceMappingURL=index.d.ts.map