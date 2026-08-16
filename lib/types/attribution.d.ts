/**
 * F8 bundle source attribution: where each layer entry comes from (in-box
 * vs a profile dependency vs a patch-only leftover) plus the F12 HMR
 * capability probe. Pure reads — never writes.
 */
export type BundleSource = 'inbox' | 'dependency' | 'patch';
export interface BundleAttribution {
    source: BundleSource;
    layerIndex: number;
    introducedBy?: string;
    hotReloadable: boolean;
}
/** Read a package's own manifest from the profile's node_modules. */
export declare function readOwnPackage(dir: string, name: string): Record<string, unknown> | null;
/** F12 probe: does the package declare hot-reload capability? */
export declare function isHotReloadable(dir: string, name: string): boolean;
/**
 * Attribute one bundle layer entry. `dependencies` comes from the profile
 * manifest; in-box packages (never dependencies) are the official stack.
 */
export declare function attributeBundle(options: {
    name: string;
    index: number;
    dependencies: Record<string, string>;
    profileDir: string;
}): BundleAttribution;
/** F8: attribute every layer entry of a profile manifest. */
export declare function attributeBundles(profileDir: string): Array<{
    name: string;
} & BundleAttribution>;
//# sourceMappingURL=attribution.d.ts.map