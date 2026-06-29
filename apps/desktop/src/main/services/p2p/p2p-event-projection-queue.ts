import { logStructured } from '../structured-log.service'
import type { WorkspaceEvent } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { projectP2pEvent } from './p2p-event-projector'
import {
  dequeueProjectionOutbox,
  enqueueProjectionOutbox,
  loadProjectionOutbox,
  persistProjectionOutbox,
} from './p2p-projection-outbox'

let projectionRetryQueue: Map<string, WorkspaceEvent> | null = null

function getProjectionRetryQueue(): Map<string, WorkspaceEvent> {
  if (!projectionRetryQueue) {
    projectionRetryQueue = loadProjectionOutbox()
  }
  return projectionRetryQueue
}

export function projectP2pEventSafe(event: WorkspaceEvent): void {
  const queue = getProjectionRetryQueue()
  try {
    projectP2pEvent(event)
    dequeueProjectionOutbox(queue, event.eventId)
  } catch (error) {
    if (!queue.has(event.eventId)) {
      enqueueProjectionOutbox(queue, event)
    } else {
      queue.set(event.eventId, event)
      persistProjectionOutbox(queue)
    }
    logStructured('p2p', 'warn', `projection failed for ${event.eventId}: ${toErrorMessage(error, 'projection failed')}`)
  }
}

export function drainProjectionRetryQueue(): void {
  const queue = getProjectionRetryQueue()
  for (const [eventId, event] of [...queue]) {
    try {
      projectP2pEvent(event)
      dequeueProjectionOutbox(queue, eventId)
    } catch {
      // keep for next drain
    }
  }
}
