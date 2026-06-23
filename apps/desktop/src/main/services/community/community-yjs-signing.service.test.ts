import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSign = vi.fn(() => 'mock-signature')
const mockVerify = vi.fn(() => true)

vi.mock('../p2p/p2p-crypto.service', () => ({
  signDeviceMessage: () => mockSign(),
  verifyDeviceMessage: () => mockVerify(),
}))

vi.mock('../p2p/p2p-device-identity.service', () => ({
  getP2pDeviceInfo: () => ({
    deviceId: '00000000-0000-0000-0000-000000000099',
    publicKey: Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64'),
  }),
}))

vi.mock('./community-federated-trust.service', () => ({
  isDidBlocked: () => false,
}))

describe('community-yjs-signing.service', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSign.mockClear()
    mockVerify.mockClear()
    mockVerify.mockReturnValue(true)
  })

  it('signs outbound wire with local DID', async () => {
    const { signCommunityYjsWireMessage, getLocalCommunityDid } = await import(
      './community-yjs-signing.service'
    )

    const did = getLocalCommunityDid()
    expect(did).toMatch(/^did:toolman:v1:/)

    const wire = signCommunityYjsWireMessage({
      domain: 'board',
      update: 'dGVzdA==',
      at: 1_700_000_000_000,
    })

    expect(wire.v).toBe(2)
    expect(wire.signerDid).toBe(did)
    expect(wire.signature).toBe('mock-signature')
    expect(mockSign).toHaveBeenCalledOnce()
  })

  it('rejects wire when signature verify fails', async () => {
    mockVerify.mockReturnValue(false)
    const { signCommunityYjsWireMessage, verifyCommunityYjsSignedWireMessage } = await import(
      './community-yjs-signing.service'
    )

    const wire = signCommunityYjsWireMessage({
      domain: 'board',
      update: 'dGVzdA==',
      at: 1,
    })

    const result = verifyCommunityYjsSignedWireMessage(wire)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid signature')
    }
  })
})
