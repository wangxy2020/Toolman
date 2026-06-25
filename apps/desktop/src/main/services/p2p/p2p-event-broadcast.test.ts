import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceEvent } from '@toolman/shared'

const send = vi.fn()
const liveWin = { isDestroyed: () => false, webContents: { send } }

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [liveWin],
  },
}))

import { broadcastP2pEventAppended } from './p2p-event-broadcast'

describe('p2p-event-broadcast', () => {
  it('broadcasts appended workspace events', () => {
    const event: WorkspaceEvent = {
      eventId: '22222222-2222-4222-8222-222222222222',
      workspaceId: '11111111-1111-4111-8111-111111111111',
      seq: 1,
      resourceType: 'Note',
      resourceId: 'note-1',
      operatorId: 'op-1',
      eventType: 'Updated',
      payload: {},
      timestamp: 1_700_000_000_000,
      sourceDeviceId: 'dev-1',
    }
    broadcastP2pEventAppended(event)
    expect(send).toHaveBeenCalledWith('p2p:event:appended', event)
  })
})
