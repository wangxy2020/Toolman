import { describe, expect, it, vi } from 'vitest'

vi.mock('./p2p-crypto.service', () => ({
  signDeviceMessage: vi.fn(() => 'test-signature'),
  verifyDeviceMessage: vi.fn(() => true),
}))

vi.mock('./p2p-device-identity.service', () => ({
  getP2pDeviceInfo: vi.fn(() => ({
    deviceId: '11111111-1111-1111-1111-111111111111',
    publicKey: 'local-public-key',
  })),
}))

vi.mock('./p2p-peer.service', () => ({
  resolvePeerPublicKey: vi.fn(() => 'peer-public-key'),
}))

import {
  signMemberSyncRequestWireMessage,
  verifyMemberSyncRequestWireMessage,
  verifyMemberSyncResponseWireMessage,
} from './p2p-member-sync-signing.service'

const PEER_ID = '11111111-1111-1111-1111-111111111111'

describe('p2p-member-sync-signing.service', () => {
  it('signs member.sync_request with signer device id', () => {
    const signed = signMemberSyncRequestWireMessage('workspace-1')
    expect(signed.v).toBe(2)
    expect(signed.type).toBe('member.sync_request')
    expect(signed.signerDeviceId).toBe(PEER_ID)
    expect(signed.signature).toBe('test-signature')
  })

  it('verifies member.sync_request when signer matches peer', () => {
    const signed = signMemberSyncRequestWireMessage('workspace-1')
    const result = verifyMemberSyncRequestWireMessage(PEER_ID, signed)
    expect(result.ok).toBe(true)
  })

  it('rejects member.sync_response when signer does not match peer', () => {
    const result = verifyMemberSyncResponseWireMessage('22222222-2222-2222-2222-222222222222', {
      v: 2,
      type: 'member.sync_response',
      workspaceId: 'workspace-1',
      at: Date.now(),
      signerDeviceId: PEER_ID,
      signature: 'test-signature',
      member: {
        id: 'member-1',
        workspaceId: 'workspace-1',
        deviceId: PEER_ID,
        displayName: 'Alice',
        role: 'member',
      },
    })
    expect(result.ok).toBe(false)
  })
})
