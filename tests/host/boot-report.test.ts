import { describe, expect, it } from 'vitest'
import { readLoaderEntries } from '../../src/boot-report.ts'

describe('readLoaderEntries', () => {
  it('projects the REAL cordis loader shape (generator, not array)', () => {
    const loader = {
      entries: function * entries(): Generator<Record<string, unknown>> {
        yield { id: 'a', module: 'pkg-a', phase: 'active' }
        yield { id: 'b', phase: 'failed', error: 'boom' }
        yield { id: 'c', phase: 'failed', error: new Error('wrapped') }
      },
    }
    expect(readLoaderEntries(loader)).toEqual([
      { id: 'a', module: 'pkg-a', phase: 'active' },
      { id: 'b', phase: 'failed', error: 'boom' },
      { id: 'c', phase: 'failed', error: 'wrapped' },
    ])
  })

  it('degrades to an empty report for a non-iterable entries() result', () => {
    const loader = { entries: () => ({}) }
    expect(readLoaderEntries(loader as never)).toEqual([])
  })

  it('degrades to an empty report when entries() throws', () => {
    const loader = {
      entries: () => {
        throw new Error('nope')
      },
    }
    expect(readLoaderEntries(loader as never)).toEqual([])
  })

  it('returns an empty report without a loader', () => {
    expect(readLoaderEntries(undefined)).toEqual([])
  })
})
