/**
 * Ambient declaration for the host-provided `@deepseek-ai/dsh-tools` module
 * (same package the official dsh-tool-* plugins import). The module ships
 * with the harness; the panel only touches `defineTool`, so this file types
 * that subset (parameters are author-facing plain records; `output` carries
 * the enforced JSON-schema subset plus the text renderer). Runtime
 * resolution stays lazy — an unresolvable module makes tool registration a
 * no-op instead of crashing the plugin.
 */

declare module '@deepseek-ai/dsh-tools' {
  export interface DefineToolOptions {
    name: string
    description?: string
    parameters?: Record<string, unknown>
    output: { schema: Record<string, unknown>; render: (args: unknown, value: unknown) => unknown }
    execute?: (...args: unknown[]) => unknown
    timeoutMs?: number
  }
  export function defineTool(options: DefineToolOptions): unknown
}
