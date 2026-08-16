/**
 * F7 profile comparison: which bundle dependencies differ between two
 * profiles (missing on one side, version drift). Feeds the panel's
 * side-by-side CompareCard. Pure reads — never writes.
 */
export interface ProfileDiff {
    profiles: string[];
    onlyInA: string[];
    onlyInB: string[];
    versionDiffers: Array<{
        bundle: string;
        a: string | null;
        b: string | null;
    }>;
}
export declare function diffProfiles(options: {
    a: {
        name: string;
        dir: string;
    };
    b: {
        name: string;
        dir: string;
    };
}): ProfileDiff;
//# sourceMappingURL=compare.d.ts.map