import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendAudit, auditFile, readAudit, rotatedAuditFile } from '../../src/audit.ts'
import { readLoaderEntries } from '../../src/boot-report.ts'

const roots: string[] = []

function fixture(label: string): string {
  const dir = join(process.cwd(), 'tests', 'tmp', `audit-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  roots.push(dir)
  return dir
}

describe('appendAudit + readAudit (F10)', () => {
  it('appends and reads newest-first', () => {
    const dir = fixture('basic')
    appendAudit(dir, { action: 'install', profile: 'web', package: 'a', ok: true })
    appendAudit(dir, { action: 'restart', profile: 'web', ok: true })
    appendAudit(dir, { action: 'install', profile: 'desktop', package: 'b', ok: false, error: 'boom' })
    const result = readAudit(dir, 10, 0)
    expect(result.total).toBe(3)
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0]?.package).toBe('b')
    expect(result.entries[0]?.error).toBe('boom')
    expect(result.entries[2]?.package).toBe('a')
  })

  it('paginates with limit and offset', () => {
    const dir = fixture('page')
    for (let index = 0; index < 5; index++) {
      appendAudit(dir, { action: 'restart', profile: 'web', ok: true })
    }
    const result = readAudit(dir, 2, 1)
    expect(result.total).toBe(5)
    expect(result.entries).toHaveLength(2)
  })

  it('rotates past 1000 entries and merges the rotated file', () => {
    const dir = fixture('rotate')
    for (let index = 0; index < 1001; index++) {
      appendAudit(dir, { action: 'restart', profile: 'web', ok: true })
    }
    expect(existsSync(rotatedAuditFile(dir))).toBe(true)
    expect(existsSync(auditFile(dir))).toBe(true)
    const result = readAudit(dir, 2000, 0)
    expect(result.total).toBe(1001)
  })

  it('skips corrupt lines without failing', () => {
    const dir = fixture('corrupt')
    appendAudit(dir, { action: 'restart', profile: 'web', ok: true })
    writeFileSync(auditFile(dir), 'not json\n', { flag: 'a' })
    appendAudit(dir, { action: 'restart', profile: 'web', ok: true })
    const result = readAudit(dir, 10, 0)
    expect(result.total).toBe(2)
  })
})

describe('readLoaderEntries (F9)', () => {
  it('projects loader entries into the report shape', () => {
    const entries = readLoaderEntries({
      entries: () => [
        { id: 'a', module: 'dshmarket', phase: 'active' },
        { id: 'b', module: 'broken', phase: 'failed', error: 'cannot resolve' },
        { id: 'c', phase: 'pending' },
        { id: 42, phase: 'failed', error: new Error('x') },
      ],
    })
    expect(entries).toEqual([
      { id: 'a', module: 'dshmarket', phase: 'active' },
      { id: 'b', module: 'broken', phase: 'failed', error: 'cannot resolve' },
      { id: 'c', phase: 'pending' },
      { id: '42', phase: 'failed', error: 'x' },
    ])
  })

  it('degrades to an empty list without a loader', () => {
    expect(readLoaderEntries(undefined)).toEqual([])
    expect(readLoaderEntries({ entries: () => { throw new Error('nope') } })).toEqual([])
  })
})

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
})
