import { describe, expect, it } from 'vitest'
import {
  isAllowedInviteHubUrl,
  normalizeInviteHubUrls,
  P2pJoinInviteAnswerInputSchema,
  P2pJoinRegisterInputSchema,
  P2pJoinRegisterOutputSchema,
} from './p2p-join.js'

describe('invite hub urls', () => {
  it('allows LAN and Tailscale, rejects public hosts', () => {
    expect(isAllowedInviteHubUrl('http://192.168.1.8:17890')).toBe(true)
    expect(isAllowedInviteHubUrl('http://100.64.1.8:17890')).toBe(true)
    expect(isAllowedInviteHubUrl('https://hub.toolman.app')).toBe(false)
    expect(normalizeInviteHubUrls(['http://192.168.1.8:17890/', 'http://evil.example'])).toEqual([
      'http://192.168.1.8:17890',
    ])
  })

  it('parses a register payload', () => {
    const parsed = P2pJoinRegisterInputSchema.parse({
      inviteToken: 'toolman://join?token=a',
      displayName: 'B',
      deviceId: 'phone-b',
    })
    expect(parsed.deviceKind).toBe('mobile')
  })

  it('accepts register extras used by WebRTC join', () => {
    const parsed = P2pJoinRegisterOutputSchema.parse({
      ok: true,
      workspaceId: 'ws-a',
      member: {
        id: 'm-1',
        deviceId: 'phone-b',
        identityId: 'id-b',
        displayName: 'B',
        role: 'member',
        status: 'invited',
        deviceKind: 'mobile',
      },
      inviteId: 'inv-1',
      ownerDeviceId: 'desk-a',
      offerSdp: 'v=0',
      workspaceKeyB64: 'dGVzdA',
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    expect(parsed.offerSdp).toBe('v=0')
    expect(parsed.workspaceKeyB64).toBe('dGVzdA')
  })

  it('parses an invite answer payload', () => {
    const parsed = P2pJoinInviteAnswerInputSchema.parse({
      inviteToken: 'toolman://join?token=a',
      answerSdp: 'v=0',
      deviceId: 'phone-b',
    })
    expect(parsed.deviceId).toBe('phone-b')
  })
})
