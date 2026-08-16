/**
 * F10 audit log: a local JSONL timeline of every panel-driven change
 * (install / update / undo / restart / align), one file per profile under
 * `.dsh-profile-panel/audit.jsonl`. Append-only, best-effort (a failed write
 * never blocks the operation it records), rotated after 1000 entries or 30
 * days. Never contains conversation content — only operator actions.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNDO_STORE } from './install.js';
const MAX_ENTRIES = 1000;
const ROTATE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Strictly increasing timestamps so same-millisecond entries stay ordered. */
let lastTs = 0;
export function auditFile(profileDir) {
    return join(profileDir, UNDO_STORE, 'audit.jsonl');
}
export function rotatedAuditFile(profileDir) {
    return join(profileDir, UNDO_STORE, 'audit.1.jsonl');
}
function lineCount(path) {
    try {
        return readFileSync(path, 'utf8').split('\n').filter(line => line.trim() !== '').length;
    }
    catch {
        return 0;
    }
}
function rotateIfNeeded(profileDir) {
    const file = auditFile(profileDir);
    if (!existsSync(file))
        return;
    const stat = statSync(file);
    if (lineCount(file) >= MAX_ENTRIES || Date.now() - stat.mtimeMs > ROTATE_AGE_MS) {
        try {
            renameSync(file, rotatedAuditFile(profileDir));
        }
        catch { /* rotation is best-effort */ }
    }
}
/** Append one audit entry (best-effort; never throws). */
export function appendAudit(profileDir, entry) {
    try {
        mkdirSync(join(profileDir, UNDO_STORE), { recursive: true });
        rotateIfNeeded(profileDir);
        lastTs = Math.max(Date.now(), lastTs + 1);
        appendFileSync(auditFile(profileDir), JSON.stringify({ ts: lastTs, ...entry }) + '\n');
    }
    catch { /* audit must never block the operation it records */ }
}
function readFileLines(path) {
    let raw = '';
    try {
        raw = readFileSync(path, 'utf8');
    }
    catch {
        return [];
    }
    const entries = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed !== null && typeof parsed === 'object' && typeof parsed.ts === 'number') {
                entries.push(parsed);
            }
        }
        catch { /* skip corrupt lines */ }
    }
    return entries;
}
/** Read the audit timeline (current + rotated file), newest first. */
export function readAudit(profileDir, limit = 50, offset = 0) {
    const entries = [...readFileLines(auditFile(profileDir)), ...readFileLines(rotatedAuditFile(profileDir))]
        .sort((a, b) => b.ts - a.ts);
    const clamped = Math.max(1, Math.min(limit, 200));
    return {
        total: entries.length,
        entries: entries.slice(Math.max(0, offset), Math.max(0, offset) + clamped),
    };
}
