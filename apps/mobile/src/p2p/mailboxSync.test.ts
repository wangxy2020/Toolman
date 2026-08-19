import { describe, expect, it } from 'vitest'
import { applyWorkspaceWireEvents } from './groupChatMesh'
import { subscribeMeshEvents } from './meshEvents'
import {
  getMailboxTarget,
  mailboxHubs,
  patchMailboxOwnerDevice,
  readMailboxSeq,
  rememberMailboxSeq,
  startMailboxSync,
} from './mailboxSync'

describe('mailbox event apply', () => {
  it('projects a mailbox-delivered group chat event onto the UI stream', () => {
    const seen: string[] = []
    const stop = subscribeMeshEvents((event) => {
      if (event.type === 'chat') seen.push(event.message.content)
    })
    const workspaceId = '33333333-3333-3333-3333-333333333333'
    const event = {
      seq: 8,
      resourceType: 'GroupChat',
      resourceId: workspaceId,
      eventType: 'Updated',
      timestamp: 1,
      payloadJson: JSON.stringify({
        v: 1,
        kind: 'group.chat.message',
        message: {
          id: '22222222-2222-2222-2222-222222222222',
          workspaceId,
          senderMemberId: 'm-a',
          senderName: 'A',
          contentBlocks: [{ type: 'text', text: 'mailbox-hi' }],
          createdAt: 1,
        },
      }),
    }
    expect(applyWorkspaceWireEvents(workspaceId, [event])).toBe(1)
    expect(applyWorkspaceWireEvents(workspaceId, [event])).toBe(0)
    stop()
    expect(seen).toEqual(['mailbox-hi'])
  })

  it('projects shared agent topics instead of the agent name only', () => {
    const items: Array<{ id: string; parentId?: string; permission?: string }> = []
    const stop = subscribeMeshEvents((event) => {
      if (event.type === 'shared' && event.item.kind === 'agents') {
        items.push({
          id: event.item.id,
          parentId: event.item.parentId,
          permission: event.item.sessionPermission,
        })
      }
    })
    const workspaceId = '44444444-4444-4444-4444-444444444444'
    applyWorkspaceWireEvents(workspaceId, [
      {
        seq: 2,
        resourceType: 'Agent',
        resourceId: 'ag-1',
        operatorId: 'member-a',
        sourceDeviceId: 'desk-a',
        eventType: 'Shared',
        timestamp: 1,
        payloadJson: JSON.stringify({
          assistant_id: 'ag-1',
          name: '助手',
          session_ids: ['sess-1'],
          session_titles: { 'sess-1': '问候' },
          session_permissions: { 'sess-1': 'callable' },
        }),
      },
    ])
    stop()
    expect(items).toEqual([
      { id: 'ag-1' },
      { id: 'sess-1', parentId: 'ag-1', permission: 'callable' },
    ])
  })
})

describe('mailbox hubs', () => {
  it('keeps workspace mailbox on the owner Sync Hub, not the official catalog', () => {
    const hubs = mailboxHubs('http://192.168.1.8:17890')
    expect(hubs[0]).toBe('http://192.168.1.8:17890')
    expect(hubs).toContain('http://127.0.0.1:17890')
    expect(hubs.some((url) => url.includes('hub.toolman.app'))).toBe(false)
    expect(hubs.some((url) => url.includes(':3721'))).toBe(false)
  })

  it('ignores community proxy paths and catalog ports', () => {
    expect(mailboxHubs('/api/community-hub')).toEqual([
      'http://127.0.0.1:17890',
      'http://localhost:17890',
    ])
    expect(mailboxHubs('http://127.0.0.1:3721')).toEqual([
      'http://127.0.0.1:17890',
      'http://localhost:17890',
    ])
  })
})

describe('mailbox cursor', () => {
  it('advances per hub so old envelopes cannot hide newer replies', () => {
    const workspaceId = '44444444-4444-4444-4444-444444444444'
    rememberMailboxSeq(workspaceId, 'http://127.0.0.1:3721', 50)
    rememberMailboxSeq(workspaceId, 'http://127.0.0.1:3721', 40)
    rememberMailboxSeq(workspaceId, 'https://hub.example', 9)
    expect(readMailboxSeq(workspaceId, 'http://127.0.0.1:3721')).toBe(50)
    expect(readMailboxSeq(workspaceId, 'https://hub.example')).toBe(9)
  })

  it('fills a missing owner device on an existing mailbox target', () => {
    const workspaceId = '55555555-5555-5555-5555-555555555555'
    startMailboxSync({
      hubUrl: 'http://127.0.0.1:3721',
      workspaceId,
      deviceId: 'phone-b',
      workspaceKey: new Uint8Array(32).fill(1),
    })
    expect(getMailboxTarget(workspaceId)?.ownerDeviceId).toBeUndefined()
    expect(patchMailboxOwnerDevice(workspaceId, 'desk-a')?.ownerDeviceId).toBe('desk-a')
    expect(getMailboxTarget(workspaceId)?.ownerDeviceId).toBe('desk-a')
  })
})
