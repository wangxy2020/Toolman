import { describe, expect, it } from 'vitest'
import {
  admitMailboxProposal,
  canForwardWorkspaceAsGateway,
  describeP2pJoinFailure,
  formatP2pPathMetrics,
  iceServersHaveTurn,
  isInviteExpired,
  admitMemberManagementProposal,
  isMemberManagementProposal,
} from './hardening.js'

describe('p2p hardening', () => {
  it('treats past expiresAt as expired', () => {
    expect(isInviteExpired(1, 2)).toBe(true)
    expect(isInviteExpired(5, 2)).toBe(false)
    expect(isInviteExpired(undefined, 2)).toBe(false)
  })

  it('detects TURN urls and explains join timeouts', () => {
    expect(iceServersHaveTurn([{ urls: 'stun:stun.l.google.com:19302' }])).toBe(false)
    expect(iceServersHaveTurn([{ urls: ['turn:relay.example:3478'] }])).toBe(true)
    expect(describeP2pJoinFailure({ message: '等待群主握手超时', hasTurn: false })).toContain('TURN')
    expect(describeP2pJoinFailure({ message: '等待群主握手超时', hasTurn: true })).toContain('信箱')
  })

  it('blocks gateway forward when the local device is not a member', () => {
    expect(canForwardWorkspaceAsGateway(false)).toBe(false)
    expect(canForwardWorkspaceAsGateway(true)).toBe(true)
    expect(formatP2pPathMetrics({
      meshSends: 2,
      mailboxPuts: 1,
      mailboxPullApplied: 3,
      joinDirectOk: 1,
      joinFailed: 0,
      lastCatchUpMs: 40,
    })).toContain('信箱补齐 3')
    expect(admitMailboxProposal({ senderCanWrite: false, duplicate: false })).toEqual({
      ok: false,
      reason: 'readonly',
    })
    expect(admitMailboxProposal({ senderCanWrite: true, duplicate: true })).toEqual({
      ok: false,
      reason: 'replay',
    })
    expect(admitMailboxProposal({ senderCanWrite: true, duplicate: false })).toEqual({ ok: true })
    expect(
      admitMemberManagementProposal({
        senderActive: true,
        senderCanManageMembers: true,
        targetIsOwner: false,
        targetIsSelf: false,
        actorIsAdmin: false,
        targetIsAdmin: false,
      }),
    ).toEqual({ ok: true })
    expect(
      admitMemberManagementProposal({
        senderActive: true,
        senderCanManageMembers: false,
        targetIsOwner: false,
        targetIsSelf: false,
        actorIsAdmin: false,
        targetIsAdmin: false,
      }),
    ).toEqual({ ok: false, reason: 'forbidden' })
    expect(isMemberManagementProposal({ resourceType: 'Member', eventType: 'Left' })).toBe(true)
    expect(isMemberManagementProposal({ resourceType: 'Note', eventType: 'Left' })).toBe(false)
  })
})
