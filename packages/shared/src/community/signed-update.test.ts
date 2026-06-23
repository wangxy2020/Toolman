import { describe, expect, it } from 'vitest'

import {
  CommunityYjsSignedWireMessageSchema,
  buildCommunityYjsSignedUpdatePayload,
} from './signed-update.js'

describe('buildCommunityYjsSignedUpdatePayload', () => {
  it('uses fixed pipe-delimited field order', () => {
    const payload = buildCommunityYjsSignedUpdatePayload({
      domain: 'board',
      update: 'dGVzdA==',
      signerDid: 'did:toolman:v1:abc',
      publicKey: 'cHVibGlj',
      deviceId: '00000000-0000-0000-0000-000000000001',
      at: 1_700_000_000_000,
    })

    expect(payload).toBe(
      'toolman:community-yjs:v2|board|dGVzdA==|did:toolman:v1:abc|cHVibGlj|00000000-0000-0000-0000-000000000001|1700000000000',
    )
  })

  it('parses signed wire v2 schema', () => {
    const parsed = CommunityYjsSignedWireMessageSchema.parse({
      v: 2,
      domain: 'profiles',
      update: 'dGVzdA==',
      signerDid: 'did:toolman:v1:abc',
      publicKey: 'cHVibGlj',
      deviceId: '00000000-0000-0000-0000-000000000001',
      at: 1,
      signature: 'c2ln',
    })

    expect(parsed.v).toBe(2)
  })
})
