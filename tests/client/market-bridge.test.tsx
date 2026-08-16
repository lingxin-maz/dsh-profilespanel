import { describe, expect, it } from 'vitest'
import { normalizeTarget, readHashTarget } from '../../src/client/market-bridge.ts'

describe('market-bridge · normalizeTarget', () => {
  it('accepts registry names and github targets', () => {
    expect(normalizeTarget({ package: 'dshmarket' })).toEqual({ package: 'dshmarket' })
    expect(normalizeTarget({ package: '@scope/pkg', spec: '1.2.3' })).toEqual({ package: '@scope/pkg', spec: '1.2.3' })
    expect(normalizeTarget({ package: 'github:owner/repo' })).toEqual({ package: 'github:owner/repo' })
    expect(normalizeTarget({ package: 'github:owner/repo#path:/plugins/a' }))
      .toEqual({ package: 'github:owner/repo#path:/plugins/a' })
  })

  it('rejects malformed and unsafe payloads', () => {
    expect(normalizeTarget(null)).toBeNull()
    expect(normalizeTarget('github:owner/repo')).toBeNull()
    expect(normalizeTarget({})).toBeNull()
    expect(normalizeTarget({ package: '../evil' })).toBeNull()
    expect(normalizeTarget({ package: 'github:owner/repo#path:../x' })).toBeNull()
    expect(normalizeTarget({ package: 'github:owner/repo', spec: '1.0.0' })).toBeNull()
    expect(normalizeTarget({ package: 'dshmarket', spec: '1.0.0; rm -rf /' })).toBeNull()
  })
})

describe('market-bridge · readHashTarget', () => {
  it('parses plain and scoped npm targets with an optional spec', () => {
    expect(readHashTarget('#dshpp-install=dshmarket')).toEqual({ package: 'dshmarket' })
    expect(readHashTarget('#dshpp-install=dshmarket%401.5.1')).toEqual({ package: 'dshmarket', spec: '1.5.1' })
    expect(readHashTarget('#dshpp-install=%40scope%2Fpkg%401.2.3')).toEqual({ package: '@scope/pkg', spec: '1.2.3' })
    expect(readHashTarget('#dshpp-install=%40scope%2Fpkg')).toEqual({ package: '@scope/pkg' })
  })

  it('parses github targets and ignores unrelated hashes', () => {
    expect(readHashTarget('#dshpp-install=github%3Aowner%2Frepo')).toEqual({ package: 'github:owner/repo' })
    expect(readHashTarget('#dshpp-install=github%3Aowner%2Frepo%23path%3A%2Fplugins%2Fa'))
      .toEqual({ package: 'github:owner/repo#path:/plugins/a' })
    expect(readHashTarget('#other')).toBeNull()
    expect(readHashTarget('')).toBeNull()
    expect(readHashTarget('#dshpp-install=../evil')).toBeNull()
  })
})
