/**
 * F6 profile health check: static scans over the profile manifest and the
 * installed packages — broken manifests, missing packages, unsatisfied
 * peers, orphaned bundle entries, duplicate layer entries — plus a dry-run
 * reconcile preview of the next boot's bundle stack. Never writes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dshHome, manifestBundles, manifestDeps, readInstalledVersion, readProfileManifest, } from './profile.js';
import { computeReconciledBundles, semverCompare } from './install.js';
/** Whether a package's own package.json exists under the profile. */
export function packageInstalled(profileDir, name) {
    return existsSync(join(profileDir, 'node_modules', name, 'package.json'));
}
/** Resolve a package's own manifest from the profile or the shared home. */
export function readPackageManifest(profileDir, name) {
    for (const root of [join(profileDir, 'node_modules'), join(dshHome(), 'profiles', 'node_modules')]) {
        try {
            const raw = readFileSync(join(root, name, 'package.json'), 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch { /* keep looking */ }
    }
    return null;
}
/**
 * Peers shipped inside the harness installation itself (`@deepseek-ai/*`).
 * The loader provides these from its own module table, so a filesystem scan
 * can never see them — they are never reported as gaps.
 */
const HOST_PROVIDED_PEER = /^@deepseek-ai\//;
/**
 * Peer version from the profile and the shared profile store, covering both
 * the flat layout and pnpm's `.pnpm` virtual store (readInstalledVersion
 * walks both).
 */
function peerVersion(profileDir, peer) {
    return readInstalledVersion(profileDir, peer)
        ?? readInstalledVersion(join(dshHome(), 'profiles'), peer);
}
/** Best-effort resolution from this plugin's own module context. */
function tryResolvePeer(peer) {
    try {
        return import.meta.resolve(peer) !== null;
    }
    catch {
        return false;
    }
}
/** Best-effort semver range satisfaction (covers the common shapes only). */
export function satisfiesRange(installed, range) {
    if (installed === null)
        return false;
    const trimmed = range.trim();
    if (trimmed === '' || trimmed === '*' || trimmed === 'x' || trimmed === 'latest')
        return true;
    if (trimmed.startsWith('^')) {
        const base = trimmed.slice(1);
        return semverCompare(installed, base) >= 0
            && installed.split('.')[0] === base.split('.')[0];
    }
    if (trimmed.startsWith('~')) {
        const base = trimmed.slice(1);
        const installedParts = installed.split('.');
        const baseParts = base.split('.');
        return installedParts[0] === baseParts[0]
            && (baseParts[1] === undefined || installedParts[1] === baseParts[1])
            && semverCompare(installed, base) >= 0;
    }
    if (trimmed.startsWith('>='))
        return semverCompare(installed, trimmed.slice(2)) >= 0;
    if (trimmed.startsWith('<='))
        return semverCompare(installed, trimmed.slice(2)) <= 0;
    if (trimmed.startsWith('>'))
        return semverCompare(installed, trimmed.slice(1)) > 0;
    if (trimmed.startsWith('<'))
        return semverCompare(installed, trimmed.slice(1)) < 0;
    if (/^\d+\.\d+\.\d+/.test(trimmed))
        return semverCompare(installed, trimmed.split(/\s/)[0] ?? trimmed) === 0;
    return true; // unknown range shapes are not reported as gaps (avoid false positives)
}
/**
 * Collect the health payload for one profile. Every scan failure degrades to
 * a report entry — this function never throws.
 */
export function collectHealth(profileDir, profileName) {
    const issues = [];
    let manifest;
    try {
        manifest = readProfileManifest(profileDir);
    }
    catch (error) {
        return {
            profile: profileName,
            ok: false,
            nextBundles: [],
            issues: [{
                    severity: 'error',
                    code: 'manifest-broken',
                    message: error instanceof Error ? error.message : String(error),
                }],
        };
    }
    const bundles = manifestBundles(manifest);
    const dependencies = manifestDeps(manifest);
    // Duplicate layer entries.
    const seen = new Set();
    for (const bundle of bundles) {
        if (seen.has(bundle)) {
            issues.push({ severity: 'warning', code: 'duplicate-bundle', bundle, message: `bundle 在层栈中重复: ${bundle}` });
        }
        seen.add(bundle);
    }
    // Orphan bundle entries: listed but not a dependency and not an in-box
    // official package — a leftover after an uninstall that skipped reconcile.
    const dependencySet = new Set(Object.keys(dependencies));
    for (const bundle of bundles) {
        if (!dependencySet.has(bundle) && !bundle.startsWith('@deepseek-ai/')) {
            issues.push({
                severity: 'info',
                code: 'orphan-bundle',
                bundle,
                message: `bundles 中存在但非 dependencies 且非内置包（疑似残留）: ${bundle}`,
            });
        }
    }
    // Missing packages: declared somewhere but not installed.
    for (const bundle of [...new Set([...bundles, ...Object.keys(dependencies)])]) {
        if (bundle.startsWith('@deepseek-ai/'))
            continue; // in-box stack lives elsewhere
        if (!packageInstalled(profileDir, bundle)) {
            issues.push({
                severity: 'error',
                code: 'missing-package',
                bundle,
                message: `声明于 dependencies/bundles 但 node_modules 中缺失: ${bundle}`,
            });
        }
    }
    // Peer gaps: each dependency's peerDependencies vs what is resolvable.
    // Host-provided `@deepseek-ai/*` peers are never judged by the filesystem
    // scan; other peers are looked up in the profile + shared stores (flat and
    // .pnpm layouts), then via the host module resolver from this plugin's own
    // context — only a peer that fails all three is reported as missing.
    for (const [name] of Object.entries(dependencies)) {
        if (!packageInstalled(profileDir, name))
            continue;
        const own = readPackageManifest(profileDir, name);
        const peers = own?.peerDependencies;
        if (peers === undefined)
            continue;
        for (const [peer, range] of Object.entries(peers)) {
            if (HOST_PROVIDED_PEER.test(peer))
                continue;
            const version = peerVersion(profileDir, peer);
            if (version !== null) {
                if (!satisfiesRange(version, range)) {
                    issues.push({
                        severity: 'warning',
                        code: 'peer-gap',
                        bundle: name,
                        message: `${name} 的 peer ${peer}@${range} 未满足（当前 ${version}）`,
                    });
                }
                continue;
            }
            if (!tryResolvePeer(peer)) {
                issues.push({
                    severity: 'warning',
                    code: 'peer-gap',
                    bundle: name,
                    message: `${name} 的 peer ${peer}@${range} 未满足（当前 缺失）`,
                });
            }
        }
    }
    // Dry-run reconcile: the next boot's bundle stack.
    let nextBundles = [];
    try {
        nextBundles = computeReconciledBundles(manifest, profileDir).bundles;
    }
    catch { /* keep the on-disk list as the preview */
        nextBundles = [...bundles];
    }
    return {
        profile: profileName,
        ok: !issues.some(issue => issue.severity === 'error'),
        nextBundles,
        issues,
    };
}
