/**
 * Live end-to-end render check (diagnostic, not part of the test suite):
 * materializes the BUILT client bundle, applies the client plugin against a
 * minimal ctx, and renders the registered settings section against the LIVE
 * host (default http://127.0.0.1:3080) with real fetch. Catches data-path
 * and render crashes that fixture-based tests cannot.
 *
 * Usage: node scripts/live-panel-check.mjs [baseUrl]
 */

import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import * as React from 'react'
import { createRoot } from 'react-dom/client'

const base = process.argv[2] ?? 'http://127.0.0.1:3080'
const bundlePath = new URL('../client/client.js', import.meta.url)

// --- minimal module table (react real, primitives stubbed) -----------------
const primitives = {
  Button(props) {
    return React.createElement('button', { 'data-variant': props.variant ?? '', disabled: props.disabled ?? false, onClick: props.onClick }, props.children)
  },
  StateDot(props) {
    return React.createElement('span', { 'data-statedot': props.state ?? 'done' })
  },
}
const table = {
  react: React,
  'react/jsx-runtime': await import('react/jsx-runtime'),
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
}

// --- jsdom + module loader -------------------------------------------------
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: base + '/',
  pretendToBeVisual: true,
})
const window = dom.window
const nativeFetch = globalThis.fetch.bind(globalThis)
const absFetch = async (input, init) => {
  const url = String(input).startsWith('/') ? base + input : input
  const at = Date.now() - startAt
  console.log(`[fetch+${at}ms] ${url}`)
  const response = await nativeFetch(url, init)
  console.log(`[fetch+${Date.now() - startAt}ms] <- ${response.status}`)
  return response
}
const startAt = Date.now()
window.fetch = absFetch
globalThis.fetch = absFetch
window.addEventListener('unhandledrejection', (event) => {
  console.log('[unhandledrejection]', String(event.reason))
})
globalThis.window = window
globalThis.document = window.document
globalThis.EventSource = undefined
globalThis.AbortController = AbortController
globalThis.HTMLElement = window.HTMLElement
globalThis.Node = window.Node
globalThis.getComputedStyle = window.getComputedStyle.bind(window)

let entry = null
window.__ModuleLoader__ = { load: (loaded) => { entry = loaded } }
new Function(readFileSync(bundlePath, 'utf8'))()

if (entry === null) throw new Error('bundle did not register a module')
const mod = entry.factory((id) => {
  const value = table[id]
  if (value === undefined) throw new Error(`module table miss: ${id}`)
  return value
})
console.log('factory exports:', Object.keys(mod).join(', '), '| id:', entry.id)

// --- apply the client plugin and capture the section registration ----------
const registered = []
const ctx = {
  effect: () => {},
  locale: {
    register: () => {},
    bind: () => (key) => key,
  },
  slots: {
    inject: (_slot, register) => register(),
    register: (meta, component) => {
      registered.push({ meta, component })
      return { meta, component }
    },
  },
}
mod.apply(ctx)
if (registered.length !== 1) throw new Error(`expected 1 section registration, got ${registered.length}`)
const { meta, component } = registered[0]
console.log('registered section meta:', JSON.stringify(meta))

// --- render against the live host ------------------------------------------
const container = window.document.getElementById('root')
const root = createRoot(container)
const errors = []
const onError = (event) => errors.push(String(event.error ?? event.message ?? 'unknown'))
window.addEventListener('error', onError)
root.render(React.createElement(component))

await new Promise((resolve) => setTimeout(resolve, 2600))
const text = container.textContent ?? ''
console.log('--- rendered text (trimmed) ---')
console.log(text.replace(/\s+/g, ' ').slice(0, 1200))
console.log('--- checks ---')
const checks = {
  'profile name web': text.includes('web'),
  'bundle dshmarket': text.includes('dshmarket'),
  'bundle dsh-profile-panel': text.includes('dsh-profile-panel'),
  'restart hint (web form)': text.includes('dsh web'),
  'no status-unavailable': !text.includes('unavailable'),
}
for (const [label, ok] of Object.entries(checks)) console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`)
if (errors.length > 0) {
  console.log('RENDER ERRORS:')
  for (const error of errors) console.log(' -', error)
}
root.unmount()
window.removeEventListener('error', onError)
const failed = Object.values(checks).some((ok) => !ok) || errors.length > 0
process.exit(failed ? 1 : 0)
