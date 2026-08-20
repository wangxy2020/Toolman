import { describe, expect, it, vi } from 'vitest'

vi.mock('./mailboxBootstrap', () => ({
  ensureMailboxForDesktopGroup: vi.fn(async () => true),
}))

vi.mock('./joinWebRtc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./joinWebRtc')>()
  return {
    ...actual,
    joinOwnerViaWebRtc: vi.fn(async () => ({ ok: true as const })),
  }
})

import { completeInviteWebRtcJoin } from './completeInviteWebRtc'
import { canJoinViaWebRtc, joinOwnerViaWebRtc } from './joinWebRtc'
import { pendingInviteFromInput } from './inviteParse'
import { ensureMailboxForDesktopGroup } from './mailboxBootstrap'

describe('completeInviteWebRtcJoin', () => {
  it('skips when the runtime has no WebRTC', async () => {
    if (canJoinViaWebRtc()) return
    const invite = pendingInviteFromInput('toolman://join?token=tok-1&wid=ws-a')
    expect(invite).not.toBeNull()
    const result = await completeInviteWebRtcJoin({
      invite: invite!,
      hubUrl: 'http://192.168.1.8:17890',
      self: { identityId: 'id-b', deviceId: 'phone-b', displayName: 'B' },
      register: {
        ok: true,
        workspaceId: 'ws-a',
        member: {
          id: 'm-1',
          deviceId: 'phone-b',
          identityId: 'id-b',
          displayName: 'B',
          role: 'member',
          status: 'invited',
        },
        offerSdp: 'v=0',
        workspaceKeyB64: 'dGVzdA',
      },
    })
    expect(result).toMatchObject({ ok: false, skipped: true, reason: 'no-webrtc' })
    expect(ensureMailboxForDesktopGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-a',
        deviceId: 'phone-b',
        preferredHubUrl: 'http://192.168.1.8:17890',
        force: true,
      }),
    )
  })

  it('skips WebRTC for mailbox-first web clients', async () => {
    const invite = pendingInviteFromInput('toolman://join?token=tok-1&wid=ws-a')
    expect(invite).not.toBeNull()
    const result = await completeInviteWebRtcJoin({
      invite: invite!,
      hubUrl: 'http://192.168.1.8:17890',
      self: { identityId: 'id-b', deviceId: 'web-b', displayName: 'B' },
      register: {
        ok: true,
        workspaceId: 'ws-a',
        member: {
          id: 'm-1',
          deviceId: 'web-b',
          identityId: 'id-b',
          displayName: 'B',
          role: 'member',
          status: 'invited',
        },
        offerSdp: 'v=0',
        workspaceKeyB64: 'dGVzdA',
      },
    })
    expect(result).toEqual({ ok: true })
    expect(joinOwnerViaWebRtc).not.toHaveBeenCalled()
    expect(ensureMailboxForDesktopGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-a',
        deviceId: 'web-b',
        preferredHubUrl: 'http://192.168.1.8:17890',
        force: true,
      }),
    )
  })
})
