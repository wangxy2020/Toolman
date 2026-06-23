import { describe, expect, it } from 'vitest'
import {
  buildGroupChatRelayExcludeDeviceIds,
  shouldRelayGroupChatAfterReceive,
} from './p2p-group-chat-relay'

describe('p2p-group-chat-relay', () => {
  const owner = 'owner-device'
  const memberA = 'member-a'
  const memberB = 'member-b'

  it('owner relays messages from members', () => {
    expect(
      shouldRelayGroupChatAfterReceive({
        localDeviceId: owner,
        ownerDeviceId: owner,
        senderDeviceId: memberA,
        ownerPeerConnected: true,
      }),
    ).toBe(true)
  })

  it('members do not relay when owner is connected', () => {
    expect(
      shouldRelayGroupChatAfterReceive({
        localDeviceId: memberB,
        ownerDeviceId: owner,
        senderDeviceId: memberA,
        ownerPeerConnected: true,
      }),
    ).toBe(false)
  })

  it('members relay when owner is offline (mesh gossip)', () => {
    expect(
      shouldRelayGroupChatAfterReceive({
        localDeviceId: memberB,
        ownerDeviceId: owner,
        senderDeviceId: memberA,
        ownerPeerConnected: false,
      }),
    ).toBe(true)
  })

  it('sender never relays its own message again on receive', () => {
    expect(
      shouldRelayGroupChatAfterReceive({
        localDeviceId: memberA,
        ownerDeviceId: owner,
        senderDeviceId: memberA,
        ownerPeerConnected: false,
      }),
    ).toBe(false)
  })

  it('excludes local device and sender from relay targets', () => {
    expect(buildGroupChatRelayExcludeDeviceIds(memberB, memberA)).toEqual(
      new Set([memberB, memberA]),
    )
  })
})
