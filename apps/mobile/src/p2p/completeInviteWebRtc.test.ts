import { describe, expect, it } from 'vitest'
import { completeInviteWebRtcJoin } from './completeInviteWebRtc'
import { canJoinViaWebRtc } from './joinWebRtc'
import { pendingInviteFromInput } from './inviteParse'

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
  })
})
