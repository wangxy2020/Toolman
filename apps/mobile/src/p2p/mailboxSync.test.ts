import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyWorkspaceWireEvents } from './groupChatMesh'
import { subscribeMeshEvents } from './meshEvents'
import {
  getMailboxTarget,
  mailboxHubs,
  patchMailboxOwnerDevice,
  readMailboxSeq,
  rememberMailboxSeq,
  resumePersistedMailboxSync,
  startMailboxSync,
  stopAllMailboxSync,
  waitForMailboxPulls,
  isMailboxSyncRunning,
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

  it('does not project Agent WAL; mailbox listings are the source of truth', () => {
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
    expect(items).toEqual([])
  })

  it('does not remove shared agents from an Agent Deleted envelope', () => {
    const removed: string[] = []
    const stop = subscribeMeshEvents((event) => {
      if (event.type === 'shared-remove') removed.push(event.id)
    })
    const workspaceId = '55555555-5555-4555-8555-555555555555'
    applyWorkspaceWireEvents(workspaceId, [
      {
        seq: 9,
        resourceType: 'Agent',
        resourceId: 'ag-1',
        eventType: 'Deleted',
        timestamp: 2,
        payloadJson: JSON.stringify({ assistant_id: 'ag-1' }),
      },
    ])
    stop()
    expect(removed).toEqual([])
  })
})

describe('mailbox hubs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('on hosted web prefers loopback Sync Hub and drops LAN HTTP', () => {
    vi.stubGlobal('location', { hostname: 'www.toolman.work' })
    expect(mailboxHubs('http://192.168.1.8:17890')).toEqual([
      'http://127.0.0.1:17890',
      'http://localhost:17890',
    ])
  })
})

describe('mailbox cursor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { envelopes: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  })

  afterEach(async () => {
    stopAllMailboxSync()
    await waitForMailboxPulls()
    vi.unstubAllGlobals()
  })

  it('shares the pull cursor across owner Sync Hub aliases', () => {
    const workspaceId = '44444444-4444-4444-4444-444444444444'
    rememberMailboxSeq(workspaceId, 'http://192.168.1.8:17890', 50)
    rememberMailboxSeq(workspaceId, 'http://127.0.0.1:17890', 40)
    expect(readMailboxSeq(workspaceId, 'http://127.0.0.1:17890')).toBe(50)
    expect(readMailboxSeq(workspaceId, 'http://192.168.1.8:17890')).toBe(50)
    expect(readMailboxSeq(workspaceId, 'http://localhost:17890')).toBe(50)
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

  it('resumes a persisted mailbox by starting the pull timer', () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    })
    const workspaceId = '66666666-6666-6666-6666-666666666666'
    startMailboxSync({
      hubUrl: 'http://127.0.0.1:17890',
      workspaceId,
      deviceId: 'web-a',
      workspaceKey: new Uint8Array(32).fill(2),
    })
    expect(isMailboxSyncRunning(workspaceId)).toBe(true)
    stopAllMailboxSync()
    expect(getMailboxTarget(workspaceId)).toBeUndefined()
    expect(isMailboxSyncRunning(workspaceId)).toBe(false)
    resumePersistedMailboxSync('web-a')
    expect(getMailboxTarget(workspaceId)?.deviceId).toBe('web-a')
    expect(isMailboxSyncRunning(workspaceId)).toBe(true)
  })
})

describe('mailbox missing group', () => {
  afterEach(async () => {
    stopAllMailboxSync()
    await waitForMailboxPulls()
    vi.unstubAllGlobals()
  })

  it('stops quietly when every owner hub says the group is gone', async () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: '群组不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const workspaceId = '77777777-7777-4777-8777-777777777777'
    startMailboxSync({
      hubUrl: 'http://127.0.0.1:17890',
      workspaceId,
      deviceId: 'web-a',
      workspaceKey: new Uint8Array(32).fill(3),
    })
    await waitForMailboxPulls()
    expect(isMailboxSyncRunning(workspaceId)).toBe(false)
    expect(getMailboxTarget(workspaceId)).toBeUndefined()
    expect(JSON.stringify(store)).not.toContain(workspaceId)
  })
})
