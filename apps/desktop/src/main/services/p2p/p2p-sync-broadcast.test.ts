import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceEvent } from '@toolman/shared'

const send = vi.fn()
const destroyedWin = { isDestroyed: () => true, webContents: { send } }
const liveWin = { isDestroyed: () => false, webContents: { send } }

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [destroyedWin, liveWin],
  },
}))

import {
  broadcastP2pSyncCompleted,
  broadcastP2pSyncError,
  broadcastP2pSyncEventApplied,
  broadcastP2pSyncProgress,
} from './p2p-sync-broadcast'

const workspaceId = '11111111-1111-4111-8111-111111111111'

const sampleEvent: WorkspaceEvent = {
  eventId: '22222222-2222-4222-8222-222222222222',
  workspaceId,
  seq: 1,
  resourceType: 'Note',
  resourceId: 'note-1',
  operatorId: 'op-1',
  eventType: 'Updated',
  payload: {},
  timestamp: 1_700_000_000_000,
  sourceDeviceId: 'dev-1',
}

describe('p2p-sync-broadcast', () => {
  beforeEach(() => {
    send.mockClear()
  })

  it('broadcasts sync progress to live windows only', () => {
    broadcastP2pSyncProgress({ workspaceId, phase: 'pull', current: 1, total: 2 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('p2p:sync:progress', {
      workspaceId,
      phase: 'pull',
      current: 1,
      total: 2,
    })
  })

  it('broadcasts sync completed', () => {
    broadcastP2pSyncCompleted({ workspaceId, eventsApplied: 3, filesFetched: 1 })
    expect(send).toHaveBeenCalledWith('p2p:sync:completed', {
      workspaceId,
      eventsApplied: 3,
      filesFetched: 1,
    })
  })

  it('broadcasts sync event applied', () => {
    broadcastP2pSyncEventApplied(sampleEvent)
    expect(send).toHaveBeenCalledWith('p2p:sync:event-applied', sampleEvent)
  })

  it('broadcasts sync error', () => {
    broadcastP2pSyncError({ workspaceId, code: 'SYNC_FAILED', message: 'boom' })
    expect(send).toHaveBeenCalledWith('p2p:sync:error', {
      workspaceId,
      code: 'SYNC_FAILED',
      message: 'boom',
    })
  })
})
