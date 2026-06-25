import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-projection-outbox-test',
  },
}))

import {
  dequeueProjectionOutbox,
  enqueueProjectionOutbox,
  loadProjectionOutbox,
  persistProjectionOutbox,
} from './p2p-projection-outbox'

const outboxPath = join('/tmp/toolman-projection-outbox-test', 'p2p', 'projection-outbox.jsonl')

const sampleEvent = {
  eventId: 'evt-1',
  workspaceId: 'ws-1',
  seq: 1,
  resourceType: 'Knowledge' as const,
  resourceId: 'kb-1',
  operatorId: 'op-1',
  eventType: 'Shared' as const,
  payload: {},
  timestamp: Date.now(),
  sourceDeviceId: 'dev-1',
}

describe('p2p-projection-outbox', () => {
  beforeEach(() => {
    if (existsSync(outboxPath)) {
      unlinkSync(outboxPath)
    }
  })

  it('persists and reloads queued projection events', () => {
    const queue = loadProjectionOutbox()
    enqueueProjectionOutbox(queue, sampleEvent)

    const reloaded = loadProjectionOutbox()
    expect(reloaded.get('evt-1')?.workspaceId).toBe('ws-1')
  })

  it('removes events from persisted outbox on dequeue', () => {
    const queue = loadProjectionOutbox()
    enqueueProjectionOutbox(queue, sampleEvent)
    dequeueProjectionOutbox(queue, 'evt-1')

    expect(queue.size).toBe(0)
    expect(loadProjectionOutbox().size).toBe(0)
  })

  it('rewrites outbox file when updating existing entries', () => {
    const queue = loadProjectionOutbox()
    enqueueProjectionOutbox(queue, sampleEvent)
    queue.set('evt-1', { ...sampleEvent, seq: 2 })
    persistProjectionOutbox(queue)

    const raw = readFileSync(outboxPath, 'utf8')
    expect(raw).toContain('"seq":2')
  })
})
