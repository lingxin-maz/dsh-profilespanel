/**
 * Wrap the tsdown CJS client bundle as a __ModuleLoader__ factory module
 * (the exact shape dsh's client-modules scanner serves to browsers):
 *
 *   window.__ModuleLoader__.load({ id: "dsh-profile-panel", factory: (require) => { ... } })
 *
 * Also normalizes the output filename (.cjs -> .js when tsdown picked the
 * package-type-aware extension) and moves the sourceMappingURL comment
 * outside the factory body.
 */

import { readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'

const ID = 'dsh-profile-panel'
const candidates = ['client/client.js', 'client/client.cjs']
const source = candidates.find(path => existsSync(path))
if (source === undefined) {
  console.error('[normalize-client-banner] no client bundle found (expected client/client.js)')
  process.exit(1)
}

let code = readFileSync(source, 'utf8')
let mapLine = ''
const mapMatch = /\/\/# sourceMappingURL=([^\s]+)\s*$/.exec(code)
if (mapMatch !== null) {
  mapLine = `\n//# sourceMappingURL=client.js.map`
  code = code.slice(0, mapMatch.index).trimEnd()
}

// Drop a stray "use strict" directive prologue — it belongs to the outer
// page, not to the factory body (cosmetic; a directive inside the factory
// would be harmless, but keep the bundle identical to the host format).
code = code.replace(/^["']use strict["'];\s*\n/m, '')

// The factory body MUST declare the CJS preamble itself: the browser kernel
// (dsh-client-web) materializes the factory with only `require` in scope, so
// a body that references `exports`/`module` without declaring them throws
// "exports is not defined" and bricks the web boot. tsdown releases differ
// on whether the cjs wrapper emits these two lines — guarantee them here,
// exactly once, before any statement that uses them.
if (!/var module = \{ exports: \{\} \}/.test(code)) {
  code = `var module = { exports: {} };\nvar exports = module.exports;\n${code}`
}

const wrapped = `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {\n${code}\n\treturn module.exports;\n\t}\n});${mapLine}\n`

const target = 'client/client.js'
if (source !== target) {
  renameSync(source, target)
  const sourceMap = `${source}.map`
  if (existsSync(sourceMap)) renameSync(sourceMap, 'client/client.js.map')
}
writeFileSync(target, wrapped)
console.log(`[normalize-client-banner] wrapped ${target}`)
