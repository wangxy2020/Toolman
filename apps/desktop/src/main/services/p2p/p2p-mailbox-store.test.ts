import { describe, expect, it } from 'vitest'
import { pullMailboxRecords, putMailboxRecord, resetMailboxStoreForTests } from './p2p-mailbox-store'

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
})
