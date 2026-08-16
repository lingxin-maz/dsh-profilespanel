/**
 * F11 agent tools: model-facing `profile_status`, `profile_updates`,
 * `profile_sync_install`, and `profile_restart` over the same executors and
 * security gates the panel uses. `defineTool` is loaded lazily from the host
 * module table (`@deepseek-ai/dsh-tools`) — when the tool registry or the
 * module is missing, registration degrades to a no-op so plain-web hosts and
 * tool-less compositions keep working.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type DesktopPresence } from './desktop.ts';
import type { PanelEventBus } from './events.ts';
import type { PanelState } from './routes.ts';
import type { RegistryView } from './registry.ts';
export interface PanelToolsDeps {
    ctx: Context;
    state: PanelState;
    profile: {
        name: string;
        dir: string;
    };
    allowRestart: boolean;
    registryView: (pkg: string) => Promise<RegistryView>;
    events: PanelEventBus;
    desktopPresence?: DesktopPresence;
}
type DefineTool = (options: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    output: {
        schema: Record<string, unknown>;
        render: (args: unknown, value: unknown) => unknown;
    };
    execute?: (...args: unknown[]) => unknown;
    timeoutMs?: number;
}) => unknown;
/** Build the four tool definitions (pure; testable without the host module). */
export declare function buildToolDefs(deps: PanelToolsDeps, defineTool: DefineTool): unknown[];
export interface ToolRegistryService {
    register(tool: unknown): unknown;
}
/**
 * Register the panel tools when both the tool registry service and the host
 * `@deepseek-ai/dsh-tools` module are available; otherwise a silent no-op
 * (plain-web hosts keep working without the tools).
 */
export declare function registerPanelTools(ctx: Context, deps: PanelToolsDeps): Promise<void>;
export {};
//# sourceMappingURL=tools.d.ts.map