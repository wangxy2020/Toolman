import { describe, expect, it, vi } from 'vitest'

const { sendEventsJson, putMailboxProposal, getMailboxTarget } = vi.hoisted(() => ({
  sendEventsJson: vi.fn(async () => {}),
  putMailboxProposal: vi.fn(async () => {}),
  getMailboxTarget: vi.fn(() => ({
    hubUrl: 'http://127.0.0.1:17890',
    workspaceId: 'ws-a',
    deviceId: 'web-b',
    workspaceKey: new Uint8Array(32),
    ownerDeviceId: 'owner-a',
  })),
}))

vi.mock('./session', () => ({
  hasLiveSession: vi.fn(() => true),
  sendEventsJson,
}))

vi.mock('./mailboxSync', () => ({
  getMailboxTarget: () => getMailboxTarget(),
  putMailboxProposal,
}))

vi.mock('./mailboxBootstrap', () => ({
  ensureMailboxForDesktopGroup: vi.fn(async () => true),
}))

vi.mock('./deviceKeys', () => ({
  signDevicePayload: vi.fn(async () => 'sig'),
}))

import { sendGroupChatOverMesh } from './groupChatMesh-send'

describe('sendGroupChatOverMesh', () => {
  it('puts mailbox proposals for web clients even when a live session exists', async () => {
    sendEventsJson.mockClear()
    putMailboxProposal.mockClear()
    const message = await sendGroupChatOverMesh({
      workspaceId: 'ws-a',
      senderMemberId: 'm-b',
      senderName: 'B',
      deviceId: 'web-b',
      text: 'hello from browser',
    })
    expect(message.content).toBe('hello from browser')
    expect(putMailboxProposal).toHaveBeenCalledTimes(1)
    expect(sendEventsJson).not.toHaveBeenCalled()
  })

  it('sends over mesh for desktop peers when a live session exists', async () => {
    sendEventsJson.mockClear()
    putMailboxProposal.mockClear()
    await sendGroupChatOverMesh({
      workspaceId: 'ws-a',
      senderMemberId: 'm-a',
      senderName: 'A',
      deviceId: '016c72ca-8be2-4fcc-aa5e-9d1e41919fb4',
      text: 'hello from desktop',
    })
    expect(sendEventsJson).toHaveBeenCalledTimes(1)
    expect(putMailboxProposal).not.toHaveBeenCalled()
  })
})
