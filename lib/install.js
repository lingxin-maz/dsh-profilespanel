/**
 * Multi-profile sync install: validate a registry package spec, run pnpm add
 * in each target profile (desktop: packaged DesktopPnpm service; plain web:
 * system pnpm), then reconcile the profile's `dsh.profile.bundles` layer list
 * with the official `dsh plugin` semantics (a dependency that declares
 * `dsh.bundle.patch` joins the layer stack).
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { declaresBundlePatch, discoverProfiles, manifestBundles, manifestDeps, readInstalledVersion, readProfileManifest, writeProfileManifest, } from './profile.js';
/** NPM package-name shape (scoped or unscoped). */
const PACKAGE_RE = /^(@[A-Za-z0-9-~][A-Za-z0-9._~-]*\/)?[A-Za-z0-9-~][A-Za-z0-9._~-]*$/;
/** Version spec shape: exact pins, ranges, prereleases, and dist-tags. */
const SPEC_RE = /^[A-Za-z0-9~^<>=*+-][A-Za-z0-9._~^<>=*+-]*$/;
/** Whole spec argument pnpm will receive. */
const TARGET_RE = /^(@[A-Za-z0-9-~][A-Za-z0-9._~-]*\/)?[A-Za-z0-9-~][A-Za-z0-9._~-]*(@[A-Za-z0-9~^<>=*+-][A-Za-z0-9._~^<>=*+-]*)?$/;
/**
 * F17: GitHub install target shape — the panel's market integration installs
 * GitHub-only plugins exactly like dshmarket does. Strict on purpose: repo
 * names are plain `owner/repo`, and the optional `#path:/sub` monorepo
 * selector only accepts literal path segments (no `..`, no empty segments).
 */
const GITHUB_TARGET_RE = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#path:\/([A-Za-z0-9_./-]+))?$/;
/** True when the string is a GitHub install target (validated elsewhere). */
export function isGithubTarget(target) {
    return target.startsWith('github:');
}
/**
 * Validate an install request body. Returns the canonical target argument
 * plus the bare package name, or an error string.
 *
 * F17: besides plain registry packages, `github:owner/repo[#path:/sub]`
 * targets are accepted (the panel's market integration installs GitHub-only
 * plugins with them). Local paths, git URLs, http URLs, and anything with
 * shell metacharacters are rejected.
 */
export function validateInstallTarget(packageName, spec) {
    if (typeof packageName !== 'string') {
        return { error: 'invalid package name: registry package names or github: targets only' };
    }
    const trimmed = packageName.trim();
    if (isGithubTarget(trimmed)) {
        const m = GITHUB_TARGET_RE.exec(trimmed);
        if (m === null || (m[2] !== undefined && m[2].split('/').some(seg => seg === '' || seg === '.' || seg === '..'))) {
            return { error: 'unsupported install target: github targets must look like github:owner/repo[#path:/sub]' };
        }
        if (spec !== undefined && spec !== null && spec !== '') {
            return { error: 'github targets follow the repo HEAD — no version spec allowed' };
        }
        return {
            target: trimmed,
            package: trimmed,
            kind: 'github',
            repo: m[1],
            subpath: m[2] ?? null,
        };
    }
    if (!PACKAGE_RE.test(trimmed)) {
        return { error: 'invalid package name: registry package names only' };
    }
    let target = trimmed;
    if (spec !== undefined && spec !== null && spec !== '') {
        if (typeof spec !== 'string' || !SPEC_RE.test(spec)) {
            return { error: 'invalid version spec: registry version ranges only' };
        }
        target = `${trimmed}@${spec}`;
    }
    if (!TARGET_RE.test(target) || /^(?:file|link|git|https?):/i.test(target)
        || target.includes('..') || target.includes(' ') || target.includes(';')) {
        return { error: 'unsupported install target: registry packages only' };
    }
    return { target, package: trimmed, kind: 'npm' };
}
const INSTALL_TIMEOUT_MS = Number(process.env.DSH_PROFILE_PANEL_INSTALL_TIMEOUT_MS) || 10 * 60 * 1000;
/** Windows npm/pnpm are .cmd shims: Node spawn without a shell cannot start them. */
const winCmdShim = process.platform === 'win32';
function killChild(child) {
    if (process.platform === 'win32' && child.pid !== undefined) {
        try {
            spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
            return;
        }
        catch { /* fall through */ }
    }
    try {
        child.kill('SIGKILL');
    }
    catch { /* already gone */ }
}
/** Run system pnpm (pure-web fallback), cwd = profile dir. */
export function runSystemPnpm(target, profileDir) {
    return new Promise((resolvePromise) => {
        let settled = false;
        const settle = (run) => {
            if (settled)
                return;
            settled = true;
            resolvePromise(run);
        };
        let child;
        try {
            child = spawn('pnpm', ['add', target], {
                cwd: profileDir,
                // pnpm v10+ blocks forever on a silent interactive prompt without a TTY;
                // CI mode forces it to act or fail instead of asking.
                env: { ...process.env, CI: 'true' },
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: winCmdShim,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            settle({ exitCode: 127, stdout: '', stderr: message, missing: false });
            return;
        }
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            killChild(child);
            settle({ exitCode: null, stdout, stderr: `${stderr}\ntimed out after ${INSTALL_TIMEOUT_MS}ms`, missing: false });
        }, INSTALL_TIMEOUT_MS);
        child.stdout?.on('data', (chunk) => {
            stdout = (stdout + chunk.toString()).slice(-256 * 1024);
        });
        child.stderr?.on('data', (chunk) => {
            stderr = (stderr + chunk.toString()).slice(-64 * 1024);
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            const missing = error.code === 'ENOENT';
            settle({
                exitCode: 127,
                stdout,
                stderr: missing
                    ? 'pnpm not found on PATH — install pnpm to manage profile plugins'
                    : error.message,
                missing,
            });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            settle({ exitCode: code, stdout, stderr, missing: false });
        });
    });
}
/** Run the desktop app's packaged pnpm against one profile directory. */
export async function runDesktopPnpm(service, target, profileDir) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INSTALL_TIMEOUT_MS);
    try {
        const run = service.run(['add', target, '--dir', profileDir], controller.signal);
        let stdout = '';
        let stderr = '';
        const collect = (stream, sink) => {
            stream.on('data', (chunk) => {
                const text = String(chunk);
                if (sink === 'stdout')
                    stdout = (stdout + text).slice(-256 * 1024);
                else
                    stderr = (stderr + text).slice(-64 * 1024);
            });
        };
        collect(run.stdout, 'stdout');
        collect(run.stderr, 'stderr');
        const outcome = await run.done;
        return { exitCode: outcome.exitCode, stdout, stderr, missing: false };
    }
    finally {
        clearTimeout(timer);
    }
}
/** Resolve the executor for this host: packaged pnpm on desktop, system pnpm otherwise. */
export function resolveExecutor(ctx) {
    const desktopPnpm = ctx.get('desktopPnpm');
    if (desktopPnpm !== undefined) {
        return { add: (target, dir) => runDesktopPnpm(desktopPnpm, target, dir) };
    }
    return { add: runSystemPnpm };
}
/**
 * Pure reconciliation computation (F6 dry-run shares this): returns the
 * resulting bundle list and whether it differs from the on-disk manifest.
 * Never writes.
 */
export function computeReconciledBundles(before, profileDir) {
    const after = readProfileManifest(profileDir);
    const beforeDeps = new Set(Object.keys(before.dependencies ?? {}));
    const dependencies = Object.keys(after.dependencies ?? {});
    const bundles = manifestBundles(after);
    let changed = false;
    for (const packageName of dependencies) {
        const isBundle = declaresBundlePatch(profileDir, packageName);
        if (isBundle && !bundles.includes(packageName)) {
            bundles.push(packageName);
            changed = true;
        }
    }
    const dependencySet = new Set(dependencies);
    for (const packageName of [...bundles]) {
        const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName);
        const stillBundle = dependencySet.has(packageName) && declaresBundlePatch(profileDir, packageName);
        if (wasDependency && !stillBundle) {
            bundles.splice(bundles.indexOf(packageName), 1);
            changed = true;
        }
    }
    return { bundles, changed };
}
/**
 * Reconcile `dsh.profile.bundles` against the installed state (official
 * `dsh plugin` semantics, mirrored locally): a dependency resolving to a
 * package that declares `dsh.bundle.patch` joins the layer stack (appended in
 * dependency order); a dependency-listed bundle that no longer declares it
 * leaves the stack. In-box bundles are not dependencies and are never
 * touched.
 * @returns the resulting bundle list.
 */
export function reconcileBundles(before, profileDir) {
    const { bundles, changed } = computeReconciledBundles(before, profileDir);
    if (!changed)
        return bundles;
    const after = readProfileManifest(profileDir);
    after.dsh = {
        ...after.dsh,
        profile: {
            ...after.dsh?.profile,
            bundles,
        },
    };
    writeProfileManifest(profileDir, after);
    return bundles;
}
/**
 * Whether an exact version pin resolved to an older release — the
 * supply-chain `minimumReleaseAge` degradation signal (P3). Ranges and
 * dist-tags are skipped: pnpm's own resolution is the contract there.
 */
export function isExactSpec(spec) {
    return typeof spec === 'string'
        && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(spec);
}
/** Compare two plain semver strings: -1 / 0 / 1. */
export function semverCompare(left, right) {
    const parse = (value) => {
        const core = value.replace(/^v/, '').split(/[-+]/)[0] ?? '';
        return core.split('.').slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
    };
    const a = parse(left);
    const b = parse(right);
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i])
            return a[i] > b[i] ? 1 : -1;
    }
    return 0;
}
/** Profiles eligible for a sync install (current profile always first). */
export function listInstallableProfiles(ctx, currentName) {
    const desktopProfiles = ctx.get('desktopProfiles');
    if (desktopProfiles !== undefined) {
        const listed = desktopProfiles.list()
            .filter(profile => profile.webCapable && profile.problem === undefined);
        const current = listed.find(profile => profile.name === currentName);
        const rest = listed.filter(profile => profile.name !== currentName);
        return {
            profiles: [...(current !== undefined ? [current] : []), ...rest],
            desktop: true,
        };
    }
    const found = discoverProfiles().filter(profile => profile.webCapable);
    const current = found.find(profile => profile.name === currentName);
    const rest = found.filter(profile => profile.name !== currentName);
    return {
        profiles: [...(current !== undefined ? [current] : []), ...rest],
        desktop: false,
    };
}
/**
 * Install one registry target into each requested profile, serially (avoids
 * same-store lock contention), reconciling bundles after each success.
 * Partial failure is reported per profile — no silent success, no auto
 * rollback (v1). With `rollback: true` (F2), a partial failure restores
 * every succeeded profile to its pre-install manifest and reports it in
 * `rolledBackProfiles`. The executor is injectable for tests.
 */
export async function installIntoProfiles(options) {
    const { request, ctx, currentName } = options;
    const available = listInstallableProfiles(ctx, currentName).profiles;
    const byName = new Map(available.map(profile => [profile.name, profile]));
    const requestedNames = request.profiles !== undefined && request.profiles.length > 0
        ? request.profiles
        : [currentName];
    const executor = options.executor ?? resolveExecutor(ctx);
    const results = [];
    const succeeded = [];
    for (const name of requestedNames) {
        const summary = byName.get(name);
        if (summary === undefined) {
            results.push({ profile: name, ok: false, error: `unknown or non-web profile: ${name}` });
            continue;
        }
        let before;
        try {
            before = readProfileManifest(summary.dir);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            results.push({ profile: name, ok: false, error: `profile manifest unreadable: ${message}` });
            continue;
        }
        // F2: always snapshot before mutating so `undo` has a restore point.
        saveUndoSnapshot(summary.dir);
        const githubTarget = isGithubTarget(request.package);
        const target = githubTarget ? request.package : `${request.package}${request.spec ? `@${request.spec}` : ''}`;
        let run;
        try {
            run = await executor.add(target, summary.dir);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            results.push({ profile: name, ok: false, error: `pnpm spawn failed: ${message}` });
            continue;
        }
        if (run.exitCode !== 0) {
            results.push({
                profile: name,
                ok: false,
                error: run.missing
                    ? 'pnpm not found on PATH — install pnpm to manage profile plugins'
                    : run.stderr.slice(-500) || `pnpm exited with code ${String(run.exitCode)}`,
            });
            continue;
        }
        succeeded.push({ profile: name, before });
        const bundles = reconcileBundles(before, summary.dir);
        if (githubTarget) {
            // F17: the dependency name is the repo's package.json `name`, unknown
            // before the add — diff the manifest and report what was installed.
            const beforeDeps = before.dependencies ?? {};
            const afterDeps = manifestDeps(readProfileManifest(summary.dir));
            const added = Object.keys(afterDeps).filter(dep => !(dep in beforeDeps));
            const resolved = added.length > 0
                ? added.map((dep) => {
                    const version = readInstalledVersion(summary.dir, dep);
                    return version !== null ? `${dep}@${version}` : dep;
                }).join(', ')
                : null;
            results.push({
                profile: name,
                ok: true,
                requestedVersion: null,
                resolvedVersion: resolved,
                downgraded: false,
                ...(added.length > 0 ? { installedAs: added } : {}),
            });
            continue;
        }
        if (!bundles.includes(request.package)) {
            // Installed as a plain dependency (no dsh.bundle) — still a success.
            results.push({
                profile: name,
                ok: true,
                requestedVersion: request.spec ?? null,
                resolvedVersion: readInstalledVersion(summary.dir, request.package),
                downgraded: false,
            });
            continue;
        }
        const resolved = readInstalledVersion(summary.dir, request.package);
        const downgraded = isExactSpec(request.spec) && resolved !== null
            ? semverCompare(resolved, request.spec) < 0
            : false;
        results.push({
            profile: name,
            ok: true,
            requestedVersion: request.spec ?? null,
            resolvedVersion: resolved,
            downgraded: downgraded || undefined,
        });
    }
    const overallOk = results.length > 0 && results.every(result => result.ok);
    const rolledBackProfiles = [];
    if (options.rollback === true && !overallOk && succeeded.length > 0 && results.some(result => !result.ok)) {
        for (const { profile, before } of succeeded) {
            try {
                writeProfileManifest(byName.get(profile)?.dir ?? '', before);
                rolledBackProfiles.push(profile);
            }
            catch { /* restore failure is reported by the next install attempt */ }
        }
    }
    return {
        overallOk,
        results,
        ...(rolledBackProfiles.length > 0 ? { rolledBackProfiles } : {}),
    };
}
/** Read the dependency spec pnpm wrote for a package, for diagnostics. */
export function readDependencySpec(dir, name) {
    return manifestDeps(readProfileManifest(dir))[name];
}
/* ------------------------------------------------------------------ */
/* F2 undo snapshots                                                   */
/* ------------------------------------------------------------------ */
/** Snapshot store location inside a profile directory (not a tracked file). */
export const UNDO_STORE = '.dsh-profile-panel';
/**
 * Save the current profile manifest (plus a lockfile fingerprint) under
 * `<profileDir>/.dsh-profile-panel/undo/<ts>/`. Always-on before any
 * install/update/align mutation so `undo` has a restore point; failures
 * return null and never block the mutation itself.
 */
export function saveUndoSnapshot(profileDir, now = new Date()) {
    try {
        const manifest = readProfileManifest(profileDir);
        const ts = now.toISOString().replace(/[:.]/g, '-');
        const dir = join(profileDir, UNDO_STORE, 'undo', ts);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
        try {
            const lockPath = join(profileDir, 'pnpm-lock.yaml');
            const stat = statSync(lockPath);
            const hash = createHash('sha256').update(readFileSync(lockPath)).digest('hex').slice(0, 16);
            writeFileSync(join(dir, 'lockfile.fingerprint'), `${stat.mtimeMs} ${stat.size} ${hash}\n`);
        }
        catch { /* no lockfile — skip the fingerprint */ }
        return { ts, dir, manifest };
    }
    catch {
        return null;
    }
}
/** Every saved undo snapshot for a profile, newest first. */
export function findUndoSnapshots(profileDir) {
    const root = join(profileDir, UNDO_STORE, 'undo');
    let entries;
    try {
        entries = readdirSync(root, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    }
    catch {
        return [];
    }
    const snapshots = [];
    for (const ts of entries.sort().reverse()) {
        try {
            snapshots.push({ ts, dir: join(root, ts), manifest: readProfileManifest(join(root, ts)) });
        }
        catch { /* skip corrupt snapshots */ }
    }
    return snapshots;
}
/**
 * Restore the newest snapshot manifest for one profile. Node modules are
 * not rebuilt — the hint tells the operator to run `pnpm install`.
 */
export function undoProfile(profileDir, name) {
    const snapshots = findUndoSnapshots(profileDir);
    const latest = snapshots[0];
    if (latest === undefined) {
        return { profile: name, ok: false, error: `no undo snapshot for profile: ${name}` };
    }
    try {
        writeProfileManifest(profileDir, latest.manifest);
        return {
            profile: name,
            ok: true,
            restoredTs: latest.ts,
            hint: 'manifest restored — run `pnpm install` to rebuild node_modules, then verify in the panel',
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { profile: name, ok: false, error: `restore failed: ${message}` };
    }
}
