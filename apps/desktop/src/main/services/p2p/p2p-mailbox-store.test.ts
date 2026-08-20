import { describe, expect, it } from 'vitest'
import {
  nextMailboxSeq,
  pullMailboxRecords,
  putMailboxRecord,
  resetMailboxStoreForTests,
} from './p2p-mailbox-store'

describe('p2p-mailbox-store', () => {
  it('stores ciphertext only and pulls after seq', () => {
    resetMailboxStoreForTests()
    putMailboxRecord({
      workspaceId: 'ws-1',
      recipientDeviceId: 'phone-b',
      seq: 3,
      ciphertextB64: 'QUJD',
      depositedAt: 1,
    })
    putMailboxRecord({
      workspaceId: 'ws-1',
      recipientDeviceId: 'phone-b',
      seq: 4,
      ciphertextB64: 'REVGR0g=',
      depositedAt: 2,
    })
    expect(pullMailboxRecords({ workspaceId: 'ws-1', recipientDeviceId: 'phone-b', sinceSeq: 3 })).toEqual([
      expect.objectContaining({ seq: 4, ciphertextB64: 'REVGR0g=' }),
    ])
    expect(JSON.stringify(pullMailboxRecords({ workspaceId: 'ws-1', recipientDeviceId: 'phone-b' }))).not.toContain(
      'hello',
    )
  })

  it('keeps group-chat deposits visible after an agent-relay timestamp seq', () => {
    resetMailboxStoreForTests()
    const relaySeq = nextMailboxSeq()
    putMailboxRecord({
      workspaceId: 'ws-1',
      recipientDeviceId: 'web-b',
      seq: relaySeq,
      ciphertextB64: 'cmVsYXk=',
      depositedAt: 1,
    })
    const chatSeq = nextMailboxSeq()
    putMailboxRecord({
      workspaceId: 'ws-1',
      recipientDeviceId: 'web-b',
      seq: chatSeq,
      ciphertextB64: 'Y2hhdA==',
      depositedAt: 2,
    })
    expect(chatSeq).toBeGreaterThan(relaySeq)
    expect(
      pullMailboxRecords({ workspaceId: 'ws-1', recipientDeviceId: 'web-b', sinceSeq: relaySeq }),
    ).toEqual([expect.objectContaining({ seq: chatSeq, ciphertextB64: 'Y2hhdA==' })])
  })

  it('hides a small workspace-event seq once the pull cursor is a timestamp', () => {
    resetMailboxStoreForTests()
    const relaySeq = Date.now()
    putMailboxRecord({
      workspaceId: 'ws-1',
      recipientDeviceId: 'web-b',
      seq: relaySeq,
      ciphertextB64: 'cmVsYXk=',
      depositedAt: 1,
    })
    putMailboxRecord({
      workspaceId: 'ws-1',
      recipientDeviceId: 'web-b',
      seq: 12,
      ciphertextB64: 'Y2hhdA==',
      depositedAt: 2,
    })
    expect(
      pullMailboxRecords({ workspaceId: 'ws-1', recipientDeviceId: 'web-b', sinceSeq: relaySeq }),
    ).toEqual([])
  })
})
