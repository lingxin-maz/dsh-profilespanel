/**
 * F10 audit log: a local JSONL timeline of every panel-driven change
 * (install / update / undo / restart / align), one file per profile under
 * `.dsh-profile-panel/audit.jsonl`. Append-only, best-effort (a failed write
 * never blocks the operation it records), rotated after 1000 entries or 30
 * days. Never contains conversation content — only operator actions.
 */
export type AuditAction = 'install' | 'update' | 'uninstall' | 'restart' | 'undo' | 'align';
export interface AuditEntry {
    ts: number;
    action: AuditAction;
    profile: string;
    package?: string;
    spec?: string;
    resolved?: string;
    ok: boolean;
    error?: string | null;
}
export declare function auditFile(profileDir: string): string;
export declare function rotatedAuditFile(profileDir: string): string;
/** Append one audit entry (best-effort; never throws). */
export declare function appendAudit(profileDir: string, entry: Omit<AuditEntry, 'ts'>): void;
/** Read the audit timeline (current + rotated file), newest first. */
export declare function readAudit(profileDir: string, limit?: number, offset?: number): {
    total: number;
    entries: AuditEntry[];
};
//# sourceMappingURL=audit.d.ts.map