import { describe, expect, it } from 'vitest'
import {
  P2P_MAILBOX_SESSION_PATH,
  P2pMailboxPullOutputSchema,
  P2pMailboxSessionInputSchema,
  buildMailboxGrant,
  hashMailboxGrant,
  openMailboxPlaintext,
  sealMailboxPlaintext,
} from './mailbox.js'

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111'

describe('p2p mailbox', () => {
  it('seals events so ciphertext does not contain plaintext fields', async () => {
    const workspaceKey = new Uint8Array(32).fill(9)
    const ciphertextB64 = await sealMailboxPlaintext({
      workspaceKey,
      workspaceId: WORKSPACE_ID,
      plaintext: {
        type: 'workspace.event',
        event: {
          eventId: '22222222-2222-2222-2222-222222222222',
          workspaceId: WORKSPACE_ID,
          seq: 4,
          resourceType: 'GroupChat',
          resourceId: WORKSPACE_ID,
          operatorId: 'member-a',
          eventType: 'Updated',
          payloadJson: JSON.stringify({ kind: 'group.chat.message', secret: 'hello-group' }),
          timestamp: 1_700_000_000_000,
          sourceDeviceId: 'desk-a',
        },
      },
    })
    expect(ciphertextB64).not.toContain('hello-group')
    expect(ciphertextB64).not.toContain('GroupChat')
    const opened = await openMailboxPlaintext({
      workspaceKey,
      workspaceId: WORKSPACE_ID,
      ciphertextB64,
    })
    expect(opened.type).toBe('workspace.event')
    if (opened.type === 'workspace.event') {
      expect(opened.event.seq).toBe(4)
      expect(opened.event.payloadJson).toContain('hello-group')
    }
  })

  it('binds mailbox grants to workspace + device', async () => {
    const workspaceKey = new Uint8Array(32).fill(3)
    const grantA = await buildMailboxGrant({
      workspaceKey,
      workspaceId: WORKSPACE_ID,
      deviceId: 'phone-b',
    })
    const grantOther = await buildMailboxGrant({
      workspaceKey,
      workspaceId: WORKSPACE_ID,
      deviceId: 'phone-c',
    })
    expect(grantA).not.toBe(grantOther)
    expect(await hashMailboxGrant(grantA)).toHaveLength(64)
  })

  it('accepts mailbox pull listings for shared agent topics', () => {
    const parsed = P2pMailboxPullOutputSchema.parse({
      ok: true,
      envelopes: [],
      sharedAgents: [
        {
          id: 'ag-1',
          name: '助手',
          sessionIds: ['sess-1'],
          sessionTitles: { 'sess-1': '问候' },
          sessionPermissions: { 'sess-1': 'callable' },
        },
      ],
    })
    expect(parsed.sharedAgents?.[0]?.sessionIds).toEqual(['sess-1'])
  })

  it('seals and opens agent-relay mailbox plaintext', async () => {
    const workspaceKey = new Uint8Array(32).fill(5)
    const ciphertextB64 = await sealMailboxPlaintext({
      workspaceKey,
      workspaceId: WORKSPACE_ID,
      plaintext: {
        type: 'agent-relay.message',
        senderDeviceId: 'phone-b',
        relay: {
          v: 1,
          type: 'send',
          requestId: 'req-1',
        },
      },
    })
    const opened = await openMailboxPlaintext({
      workspaceKey,
      workspaceId: WORKSPACE_ID,
      ciphertextB64,
    })
    expect(opened.type).toBe('agent-relay.message')
    if (opened.type === 'agent-relay.message') {
      expect(opened.senderDeviceId).toBe('phone-b')
      expect(opened.relay).toMatchObject({ type: 'send', requestId: 'req-1' })
    }
  })

  it('accepts a same-user mailbox session request', () => {
    expect(P2P_MAILBOX_SESSION_PATH).toBe('/api/v1/sync/p2p/mailbox/session')
    expect(
      P2pMailboxSessionInputSchema.parse({
        workspaceId: WORKSPACE_ID,
        deviceId: 'phone-a',
        identityId: 'id-a',
      }),
    ).toMatchObject({ deviceId: 'phone-a' })
  })
})
