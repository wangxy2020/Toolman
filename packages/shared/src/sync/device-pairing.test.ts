import { describe, expect, it } from 'vitest'
import {
  createDevicePairingSecrets,
  decodeDevicePairingOffer,
  encodeDevicePairingOffer,
  pairingRecordFromOffer,
  personalSyncWorkspaceId,
} from './device-pairing.js'

describe('device-pairing', () => {
  it('round-trips pairing offer codes', () => {
    const secrets = createDevicePairingSecrets()
    const code = encodeDevicePairingOffer({
      v: 1,
      identityId: 'ag-abcdef0123456789abcdef01',
      desktopDeviceId: 'desk-1',
      workspaceKeyB64: secrets.workspaceKeyB64,
      grant: secrets.grant,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    })
    expect(code.startsWith('tm1.')).toBe(true)
    const offer = decodeDevicePairingOffer(code)
    expect(offer.identityId).toBe('ag-abcdef0123456789abcdef01')
    const record = pairingRecordFromOffer({
      offer,
      localDeviceId: 'phone-1',
      role: 'mobile',
    })
    expect(record.workspaceId).toBe(personalSyncWorkspaceId(offer.identityId))
    expect(record.peerDeviceId).toBe('desk-1')
  })

  it('rejects expired offers', () => {
    const secrets = createDevicePairingSecrets()
    const code = encodeDevicePairingOffer({
      v: 1,
      identityId: 'ag-abcdef0123456789abcdef01',
      desktopDeviceId: 'desk-1',
      workspaceKeyB64: secrets.workspaceKeyB64,
      grant: secrets.grant,
      createdAt: Date.now() - 120_000,
      expiresAt: Date.now() - 60_000,
    })
    expect(() => decodeDevicePairingOffer(code)).toThrow(/过期/)
  })
})
