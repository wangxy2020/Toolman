import { describe, expect, it, vi } from 'vitest'

vi.mock('./p2p-crypto.service', () => ({
  signDeviceMessage: vi.fn(() => 'test-signature'),
  verifyDeviceMessage: vi.fn(() => true),
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

import {
  INVITE_TOKEN_VERSION,
  LEGACY_INVITE_TOKEN_VERSION,
  buildInviteCanonicalMessage,
  buildInviteUrl,
  parseInviteInput,
  verifyInviteToken,
  type InviteTokenPayload,
} from './p2p-invite.token'

describe('p2p-invite.token', () => {
  const basePayload: Omit<InviteTokenPayload, 'signature'> = {
    v: INVITE_TOKEN_VERSION,
    inviteId: 'invite-1',
    workspaceId: 'ws-1',
    workspaceName: 'Test',
    ownerDeviceId: 'owner-device',
    ownerIdentityId: 'owner-identity',
    ownerPublicKey: 'owner-pubkey',
    workspaceKeyB64: 'key-b64',
    role: 'member',
    expiresAt: Date.now() + 60_000,
    maxUses: 1,
    issuerDeviceId: 'issuer-device',
    issuerPublicKey: 'issuer-pubkey',
  }

  it('includes owner fields in v2 canonical message', () => {
    const canonical = buildInviteCanonicalMessage({
      version: INVITE_TOKEN_VERSION,
      inviteId: basePayload.inviteId,
      workspaceId: basePayload.workspaceId,
      role: basePayload.role,
      expiresAt: basePayload.expiresAt,
      maxUses: basePayload.maxUses,
      issuerDeviceId: basePayload.issuerDeviceId,
      workspaceKeyB64: basePayload.workspaceKeyB64,
      ownerDeviceId: basePayload.ownerDeviceId,
      ownerIdentityId: basePayload.ownerIdentityId,
      ownerPublicKey: basePayload.ownerPublicKey,
    })

    expect(canonical).toContain('owner-device')
    expect(canonical).toContain('owner-identity')
    expect(canonical).toContain('owner-pubkey')
  })

  it('keeps v1 canonical without owner fields', () => {
    const canonical = buildInviteCanonicalMessage({
      version: LEGACY_INVITE_TOKEN_VERSION,
      inviteId: basePayload.inviteId,
      workspaceId: basePayload.workspaceId,
      role: basePayload.role,
      expiresAt: basePayload.expiresAt,
      maxUses: basePayload.maxUses,
      issuerDeviceId: basePayload.issuerDeviceId,
      workspaceKeyB64: basePayload.workspaceKeyB64,
    })

    expect(canonical).not.toContain('owner-device')
  })

  it('requires owner metadata for v2 verification', () => {
    expect(() =>
      verifyInviteToken({
        ...basePayload,
        ownerDeviceId: '',
        signature: 'test-signature',
      }),
    ).toThrow('邀请码缺少群主身份信息')
  })

  it('parses toolman invite urls', () => {
    const token = 'abc123'
    const url = `toolman://join?token=${token}`
    expect(parseInviteInput(url).token).toBe(token)
  })

  it('builds invite urls', () => {
    expect(buildInviteUrl('token-1')).toContain('token=token-1')
  })
})
