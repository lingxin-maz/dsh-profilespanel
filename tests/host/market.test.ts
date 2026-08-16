import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createMarketService,
  parseSourceUrl,
  readMarketSnapshot,
  resolveMarketTarget,
  searchMarket,
  toMarketHit,
  tokenize,
  type MarketEntryRaw,
  type MarketFetch,
  type MarketRegistry,
} from '../../src/market.ts'

const roots: string[] = []

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})

function tmp(label: string): string {
  const dir = join(process.cwd(), 'tests', 'tmp', `market-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  roots.push(dir)
  return dir
}

function entry(overrides: Partial<MarketEntryRaw> = {}): MarketEntryRaw {
  return {
    name: 'dsh-plugin-tts',
    url: 'https://github.com/1624318455/dsh-plugin-tts',
    npm: null,
    stars: 10,
    added: '2026-01-01',
    ...overrides,
  }
}

function registry(plugins: MarketEntryRaw[]): MarketRegistry {
  return { updated: '2026-08-15', count: plugins.length, categories: {}, plugins }
}

describe('parseSourceUrl', () => {
  it('parses repos, with and without a tree subpath', () => {
    expect(parseSourceUrl('https://github.com/o/r')).toEqual({ repo: 'o/r', subpath: null })
    expect(parseSourceUrl('https://github.com/o/r/')).toEqual({ repo: 'o/r', subpath: null })
    expect(parseSourceUrl('https://github.com/o/r/tree/main/plugins/tts')).toEqual({ repo: 'o/r', subpath: 'plugins/tts' })
  })

  it('rejects non-github urls and unsafe selectors', () => {
    expect(parseSourceUrl('https://gitlab.com/o/r')).toBeNull()
    expect(parseSourceUrl('https://github.com/o')).toBeNull()
    expect(parseSourceUrl('https://github.com/o/r/tree/main/a/../b')).toBeNull()
    expect(parseSourceUrl('https://github.com/o/r/tree/main/a//b')).toBeNull()
  })
})

describe('resolveMarketTarget', () => {
  it('prefers the curated npm name, then falls back to github', () => {
    expect(resolveMarketTarget(entry())).toBe('github:1624318455/dsh-plugin-tts')
    expect(resolveMarketTarget(entry({ npm: 'dsh-plugin-tts' }))).toBe('dsh-plugin-tts')
    expect(resolveMarketTarget(entry({ url: 'https://github.com/o/col/tree/main/pkg' })))
      .toBe('github:o/col#path:/pkg')
  })

  it('ignores an invalid npm name and unsupported urls', () => {
    expect(resolveMarketTarget(entry({ npm: 'bad name' }))).toBe('github:1624318455/dsh-plugin-tts')
    expect(resolveMarketTarget(entry({ url: 'https://example.com/x' }))).toBeNull()
  })
})

describe('toMarketHit + searchMarket', () => {
  it('folds entries into hits with kind and install target', () => {
    const hit = toMarketHit(entry({ npm: 'dsh-plugin-tts', description: { zh: '文本转语音' } }))
    expect(hit).not.toBeNull()
    expect(hit?.kind).toBe('npm')
    expect(hit?.installTarget).toBe('dsh-plugin-tts')
    expect(hit?.description).toBe('文本转语音')
    expect(hit?.owner).toBe('1624318455')
  })

  it('ranks name-prefix matches first, then stars', () => {
    const data = registry([
      entry({ name: 'dsh-usage-stats', stars: 50 }),
      entry({ name: 'dsh-plugin-tts', stars: 5 }),
      entry({ name: 'dsh-plugin-tts-plus', npm: 'dsh-plugin-tts-plus', stars: 40 }),
      entry({ name: 'unrelated', url: 'https://github.com/o/unrelated' }),
    ])
    const { hits, total } = searchMarket(data, 'tts')
    expect(total).toBe(2)
    expect(hits[0]?.name).toBe('dsh-plugin-tts-plus')
    expect(hits[1]?.name).toBe('dsh-plugin-tts')
  })

  it('returns top-starred entries for an empty query and honors limit', () => {
    const data = registry([
      entry({ name: 'a', stars: 1 }),
      entry({ name: 'b', stars: 9 }),
      entry({ name: 'c', stars: 5 }),
    ])
    const { hits, total } = searchMarket(data, '', 2)
    expect(total).toBe(3)
    expect(hits.map(hit => hit.name)).toEqual(['b', 'c'])
  })

  it('matches owner, category, and npm alias keywords', () => {
    const data = registry([
      entry({ name: 'dsh-x', owner: 'make0209', category: 'usage', stars: 3 }),
      entry({ name: 'dsh-y', npm: 'dsh-tool-y', stars: 2, url: 'https://github.com/o/dsh-y' }),
    ])
    expect(searchMarket(data, 'make0209').hits.map(hit => hit.name)).toEqual(['dsh-x'])
    expect(searchMarket(data, 'usage').hits.map(hit => hit.name)).toEqual(['dsh-x'])
    expect(searchMarket(data, 'dsh-tool-y').hits.map(hit => hit.name)).toEqual(['dsh-y'])
  })

  it('tokenizes queries defensively', () => {
    expect(tokenize('  TTS  Voice ')).toEqual(['tts', 'voice'])
    expect(tokenize('')).toEqual([])
  })
})

describe('readMarketSnapshot', () => {
  it('finds a valid dshmarket snapshot and skips broken ones', () => {
    const good = tmp('good')
    const bad = tmp('bad')
    mkdirSync(join(bad, 'node_modules', 'dshmarket', 'data'), { recursive: true })
    writeFileSync(join(bad, 'node_modules', 'dshmarket', 'data', 'registry-snapshot.json'), '{broken')
    mkdirSync(join(good, 'node_modules', 'dshmarket', 'data'), { recursive: true })
    writeFileSync(join(good, 'node_modules', 'dshmarket', 'data', 'registry-snapshot.json'),
      JSON.stringify(registry([entry()])))
    const snapshot = readMarketSnapshot([bad, good])
    expect(snapshot?.plugins).toHaveLength(1)
    expect(readMarketSnapshot([bad])).toBeNull()
    expect(readMarketSnapshot([])).toBeNull()
  })
})

describe('createMarketService', () => {
  function fakeFetch(payload: unknown, ok = true): MarketFetch {
    return async () => ({ ok, status: ok ? 200 : 404, json: async () => payload })
  }

  it('serves the live registry and caches it within TTL', async () => {
    let now = 0
    let calls = 0
    const fetchFn: MarketFetch = async () => {
      calls += 1
      return { ok: true, status: 200, json: async () => registry([entry()]) }
    }
    const service = createMarketService({
      profileDirs: () => [],
      fetchFn,
      now: () => now,
      ttlMs: 60_000,
      liveUrl: 'https://example.test/plugins.json',
    })
    const first = await service.search('tts')
    expect(first.ok).toBe(true)
    expect(first.source).toBe('live')
    expect(first.results).toHaveLength(1)
    await service.search('tts')
    expect(calls).toBe(1)
    now = 61_000
    await service.search('tts')
    expect(calls).toBe(2)
  })

  it('falls back to the snapshot when the live registry fails', async () => {
    const dir = tmp('snap')
    mkdirSync(join(dir, 'node_modules', 'dshmarket', 'data'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'dshmarket', 'data', 'registry-snapshot.json'),
      JSON.stringify(registry([entry({ npm: 'dsh-plugin-tts' })])))
    const service = createMarketService({
      profileDirs: () => [dir],
      fetchFn: fakeFetch({}, false),
      liveUrl: 'https://example.test/plugins.json',
    })
    const payload = await service.search('tts')
    expect(payload.ok).toBe(true)
    expect(payload.source).toBe('snapshot')
    expect(payload.warning).toContain('snapshot')
    expect(payload.results[0]?.kind).toBe('npm')
  })

  it('degrades to ok:false without any registry source', async () => {
    const service = createMarketService({
      profileDirs: () => [],
      fetchFn: fakeFetch({}, false),
      liveUrl: 'https://example.test/plugins.json',
    })
    const payload = await service.search('tts')
    expect(payload.ok).toBe(false)
    expect(payload.source).toBe('none')
    expect(payload.results).toEqual([])
    expect(payload.warning).toContain('unavailable')
  })

  it('rejects malformed live payloads and refreshes on demand', async () => {
    let calls = 0
    const fetchFn: MarketFetch = async () => {
      return { ok: true, status: 200, json: async () => registry([entry()]) }
    }
    const service = createMarketService({
      profileDirs: () => [],
      fetchFn: async (url, init) => {
        const attempt = calls
        calls += 1
        if (attempt === 0) return { ok: true, status: 200, json: async () => ({ nope: true }) }
        return fetchFn(url, init)
      },
      liveUrl: 'https://example.test/plugins.json',
    })
    const broken = await service.search('tts')
    expect(broken.ok).toBe(false)
    await service.refresh()
    expect(await service.search('tts')).toHaveProperty('ok', true)
  })
})
