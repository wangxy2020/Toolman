import { describe, expect, it, vi } from 'vitest'

const sendReplicationMessageOnEventsChannel = vi.hoisted(() => vi.fn())

vi.mock('./p2p-events-channel', () => ({
  sendReplicationMessageOnEventsChannel,
}))

import { handleRemoteEventProposal } from './p2p-event-proposal.service'

describe('p2p-event-proposal.service', () => {
  it('rejects proposals with invalid payload json', async () => {
    sendReplicationMessageOnEventsChannel.mockClear()
    await handleRemoteEventProposal(
      'dev-member',
      {
        workspaceId: 'ws-1',
        proposalId: 'proposal-3',
        resourceType: 'Knowledge',
        resourceId: 'kb-1',
        operatorId: 'op-1',
        eventType: 'Shared',
        payloadJson: '{bad json',
        sourceDeviceId: 'dev-member',
        timestamp: Date.now(),
      },
      vi.fn(),
    )

    expect(sendReplicationMessageOnEventsChannel).toHaveBeenCalledWith(
      'dev-member',
      expect.objectContaining({
        type: 'events.propose_rejected',
        reason: '事件载荷无效',
      }),
    )
  })
})
