import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WorkspaceEvent } from '@toolman/shared'

const OUTBOX_FILE = 'projection-outbox.jsonl'

function outboxPath(): string {
  const dir = join(app.getPath('userData'), 'p2p')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, OUTBOX_FILE)
}

export function loadProjectionOutbox(): Map<string, WorkspaceEvent> {
  const path = outboxPath()
  if (!existsSync(path)) {
    return new Map()
  }

  const queue = new Map<string, WorkspaceEvent>()
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const event = JSON.parse(trimmed) as WorkspaceEvent
      if (event.eventId) {
        queue.set(event.eventId, event)
      }
    } catch {
      // skip corrupt line
    }
  }
  return queue
}

export function persistProjectionOutbox(queue: Map<string, WorkspaceEvent>): void {
  const path = outboxPath()
  if (queue.size === 0) {
    if (existsSync(path)) {
      writeFileSync(path, '', 'utf8')
    }
    return
  }

  const lines = [...queue.values()].map((event) => JSON.stringify(event))
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
}

export function enqueueProjectionOutbox(
  queue: Map<string, WorkspaceEvent>,
  event: WorkspaceEvent,
): void {
  queue.set(event.eventId, event)
  appendFileSync(outboxPath(), `${JSON.stringify(event)}\n`, 'utf8')
}

export function dequeueProjectionOutbox(
  queue: Map<string, WorkspaceEvent>,
  eventId: string,
): void {
  if (!queue.delete(eventId)) return
  persistProjectionOutbox(queue)
}
