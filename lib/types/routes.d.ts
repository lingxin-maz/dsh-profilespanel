/**
 * HTTP routes bridging the settings panel UI to the host: status readout,
 * one-click restart, and multi-profile sync install. This layer only parses
 * requests, calls the service modules, and serializes responses.
 *
 * Security: mutating routes accept only direct same-origin loopback requests
 * (no forwarding headers), refuse while another operation runs, and
 * `allowRestart: false` disables self-restart for supervisor-managed hosts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { type DesktopPresence } from './desktop.ts';
import { type RegistryView } from './registry.ts';
import { type PanelEventBus } from './events.ts';
import type { ProfilePendingState } from './multi-watch.ts';
import type { BootReportPayload } from './boot-report.ts';
import type { MarketSearchPayload } from './market.ts';
import { type BootSnapshot, type ProfileChanges, type ResolvedProfile } from './profile.ts';
export interface WebServerService {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
    }): () => void;
}
/** Desktop runtime surface the restart route drives (structural). */
export interface DesktopRuntimeService {
    requestRestart(): void | Promise<void>;
}
export interface PanelConfig {
    profile: ResolvedProfile;
    allowRestart: boolean;
    minimumReleaseAgeDays: number;
}
/** Shared mutable panel state, owned by the plugin fiber. */
export interface PanelState {
    boot: BootSnapshot | null;
    pendingRestart: boolean;
    changes: ProfileChanges | null;
    restarting: boolean;
    installing: boolean;
    /** F5: pending-restart states of every watched profile (pending only). */
    profilesPending: ProfilePendingState[];
}
export interface PanelHost {
    ctx: Context;
    webServer: WebServerService;
    config: PanelConfig;
    state: PanelState;
    logger?: {
        warn(message: string): void;
    };
    /** Registry metadata viewer (F1/F3); wired by the entry plugin. */
    registryView?: (pkg: string) => Promise<RegistryView>;
    /** F17: market search service; wired by the entry plugin. */
    marketSearch?: (query: string, limit?: number) => Promise<MarketSearchPayload>;
    /** Desktop presence override for tests; live hosts detect from ctx. */
    desktop?: DesktopPresence;
    /** F4: event bus for the SSE stream / long-poll fallback. */
    events?: PanelEventBus;
    /** F9: live boot-report reader (wired by the entry plugin). */
    readBootReport?: () => BootReportPayload;
    /** F12: hot-reload executor override for tests; live hosts probe ctx. */
    hotReload?: (bundle: string) => {
        ok: boolean;
        reason?: string;
    };
}
export type BundleState = 'loaded' | 'pending';
/** One bundle row with F8 attribution fields. */
export interface BundleStatusRow {
    name: string;
    state: BundleState;
    source?: 'inbox' | 'dependency' | 'patch';
    layerIndex?: number;
    introducedBy?: string;
    hotReloadable?: boolean;
}
/** F16 desktop-end presence as exposed to the panel UI. */
export interface DesktopStatusPayload {
    detected: boolean;
    reason: 'runtime' | 'profile' | 'app-data' | 'none';
    profile?: string;
    appDataDir?: string;
}
export interface StatusPayload {
    profileName: string;
    profileDir: string;
    profileExists: boolean;
    manifestError?: string;
    bundles: BundleStatusRow[];
    pendingRestart: boolean;
    changes: ProfileChanges | null;
    restart: {
        available: boolean;
        restarting: boolean;
        hint: string;
    };
    profiles: Array<{
        name: string;
        dir: string;
        current: boolean;
    }>;
    desktop: DesktopStatusPayload;
    minimumReleaseAgeDays: number;
    profilesPending: ProfilePendingState[];
    /** F14: desktop app's active/lastKnownGood selection (desktop hosts only). */
    desktopSelection?: {
        active?: string;
        lastKnownGood?: string;
    };
}
/** Build the GET /api/profile-panel/status payload. */
export declare function buildStatus(host: PanelHost): StatusPayload;
/**
 * Register the panel's HTTP routes.
 * @returns disposer removing every registered route.
 */
export declare function mountPanelRoutes(host: PanelHost): () => void;
//# sourceMappingURL=routes.d.ts.map