import { describe, expect, it } from 'vitest'
import { pendingInviteFromInput } from './inviteParse'
import { resolveJoinSession } from './unpackInvite'

describe('resolveJoinSession', () => {
  it('prefers offer and key from the register response', async () => {
    const invite = pendingInviteFromInput('toolman://join?token=tok-1&wid=ws-a&name=项目组')
    expect(invite).not.toBeNull()
    const session = await resolveJoinSession({
      invite: invite!,
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
        offerSdp: 'v=0\r\no=from-register\r\n',
        workspaceKeyB64: 'from-register',
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      },
    })
    expect(session.offerSdp).toContain('from-register')
    expect(session.workspaceKeyB64).toBe('from-register')
    expect(session.workspaceId).toBe('ws-a')
  })

  it('unpacks an r1 bundle when register extras are missing', async () => {
    const tokenJson = JSON.stringify({
      workspaceId: 'ws-a',
      workspaceKeyB64: 'from-token',
    })
    const token = `r1.${Buffer.from(tokenJson, 'utf8').toString('base64url')}`
    const bundle = `r1.${Buffer.from(JSON.stringify({ t: token, d: 'v=0\r\no=from-bundle\r\n' }), 'utf8').toString('base64url')}`
    const invite = pendingInviteFromInput(`toolman://join?z=${bundle}&wid=ws-a`)
    expect(invite).not.toBeNull()
    const session = await resolveJoinSession({
      invite: invite!,
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
      },
    })
    expect(session.offerSdp).toContain('from-bundle')
    expect(session.workspaceKeyB64).toBe('from-token')
  })
})
