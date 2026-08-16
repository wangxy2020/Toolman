import { describe, expect, it } from 'vitest'
import {
  getCurrentDataIdentity,
  parseOwnedPayload,
  scopedStorageKey,
  setCurrentDataIdentity,
  stringifyOwnedPayload,
} from './identityScopeCore'

describe('identityScope', () => {
  it('namespaces storage keys by identity', () => {
    setCurrentDataIdentity('id-a')
    expect(scopedStorageKey('toolman.mobile.notes.v1')).toBe('toolman.mobile.notes.v1::id-a')
    setCurrentDataIdentity('id-b')
    expect(scopedStorageKey('toolman.mobile.notes.v1')).toBe('toolman.mobile.notes.v1::id-b')
    expect(getCurrentDataIdentity()).toBe('id-b')
    setCurrentDataIdentity(null)
    expect(scopedStorageKey('toolman.mobile.notes.v1')).toBe('toolman.mobile.notes.v1::anon')
  })

  it('rejects unstamped leftovers and other users’ payloads', () => {
    setCurrentDataIdentity('id-b')
    expect(parseOwnedPayload('{"notes":[{"id":"from-a"}]}')).toBeNull()
    expect(parseOwnedPayload(stringifyOwnedPayload({ notes: 1 }, 'id-a'))).toBeNull()
    expect(parseOwnedPayload(stringifyOwnedPayload({ notes: 1 }, 'id-b'))).toEqual({ notes: 1 })
  })
})
