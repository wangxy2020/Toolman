import { describe, expect, it } from 'vitest'

import {
  TOOLMAN_DID_PREFIX,
  deriveDidFromPublicKeyB64,
  isToolmanDid,
  truncateDid,
  verifyDidMatchesPublicKey,
} from './did.js'

// Deterministic 32-byte test vector (not a real Ed25519 key — DID derivation only).
const TEST_PUBLIC_KEY_B64 = Buffer.from(
  Uint8Array.from({ length: 32 }, (_, index) => index + 1),
).toString('base64')

describe('deriveDidFromPublicKeyB64', () => {
  it('builds did:toolman:v1 prefix with base58 suffix', () => {
    const did = deriveDidFromPublicKeyB64(TEST_PUBLIC_KEY_B64)
    expect(did.startsWith(TOOLMAN_DID_PREFIX)).toBe(true)
    expect(did.length).toBeGreaterThan(TOOLMAN_DID_PREFIX.length + 10)
    expect(isToolmanDid(did)).toBe(true)
  })

  it('is stable for the same public key', () => {
    const left = deriveDidFromPublicKeyB64(TEST_PUBLIC_KEY_B64)
    const right = deriveDidFromPublicKeyB64(TEST_PUBLIC_KEY_B64)
    expect(left).toBe(right)
  })

  it('verifyDidMatchesPublicKey accepts matching pair', () => {
    const did = deriveDidFromPublicKeyB64(TEST_PUBLIC_KEY_B64)
    expect(verifyDidMatchesPublicKey(did, TEST_PUBLIC_KEY_B64)).toBe(true)
  })

  it('verifyDidMatchesPublicKey rejects mismatched public key', () => {
    const did = deriveDidFromPublicKeyB64(TEST_PUBLIC_KEY_B64)
    const otherKey = Buffer.from(Uint8Array.from({ length: 32 }, () => 9)).toString('base64')
    expect(verifyDidMatchesPublicKey(did, otherKey)).toBe(false)
  })

  it('truncateDid shortens long values', () => {
    const did = deriveDidFromPublicKeyB64(TEST_PUBLIC_KEY_B64)
    const truncated = truncateDid(did)
    expect(truncated.length).toBeLessThan(did.length)
    expect(truncated).toContain('…')
  })
})
