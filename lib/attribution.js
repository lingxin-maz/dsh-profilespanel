/**
 * F8 bundle source attribution: where each layer entry comes from (in-box
 * vs a profile dependency vs a patch-only leftover) plus the F12 HMR
 * capability probe. Pure reads — never writes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { declaresBundlePatch, manifestDeps, readProfileManifest } from './profile.js';
const HMR_MARKERS = ['cordis-plugin-hmr', '@deepseek-ai/dsh-client-hmr', '@deepseek-ai/cordis-plugin-hmr'];
/** Read a package's own manifest from the profile's node_modules. */
export function readOwnPackage(dir, name) {
    const candidates = [join(dir, 'node_modules', name, 'package.json')];
    try {
        const files = readdirSync(join(dir, 'node_modules', '.pnpm'), { withFileTypes: true });
        for (const file of files) {
            if (file.isDirectory() && file.name.startsWith(name.replace('/', '+') + '@')) {
                candidates.push(join(dir, 'node_modules', '.pnpm', file.name, 'node_modules', name, 'package.json'));
            }
        }
    }
    catch { /* no .pnpm layout */ }
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch { /* keep looking */ }
    }
    return null;
}
/** F12 probe: does the package declare hot-reload capability? */
export function isHotReloadable(dir, name) {
    const own = readOwnPackage(dir, name);
    if (own === null)
        return false;
    const dsh = own.dsh;
    if (dsh?.hot === true)
        return true;
    const deps = own.dependencies;
    if (deps !== undefined && HMR_MARKERS.some(marker => marker in deps))
        return true;
    return false;
}
/**
 * Attribute one bundle layer entry. `dependencies` comes from the profile
 * manifest; in-box packages (never dependencies) are the official stack.
 */
export function attributeBundle(options) {
    const { name, index, dependencies, profileDir } = options;
    const spec = dependencies[name];
    const declares = declaresBundlePatch(profileDir, name);
    let source = 'inbox';
    let introducedBy;
    if (spec !== undefined) {
        source = 'dependency';
        introducedBy = `${name}@${spec}`;
    }
    else if (declares) {
        source = 'patch';
    }
    return {
        source,
        layerIndex: index,
        ...(introducedBy !== undefined ? { introducedBy } : {}),
        hotReloadable: isHotReloadable(profileDir, name),
    };
}
/** F8: attribute every layer entry of a profile manifest. */
export function attributeBundles(profileDir) {
    const manifest = readProfileManifest(profileDir);
    const dependencies = manifestDeps(manifest);
    const bundles = manifest.dsh?.profile?.bundles ?? [];
    return bundles.map((name, index) => ({
        name,
        ...attributeBundle({ name, index, dependencies, profileDir }),
    }));
}
