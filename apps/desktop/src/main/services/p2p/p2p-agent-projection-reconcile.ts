import type { WorkspaceEvent } from '@toolman/shared'
import { listWorkspaceEventsSince } from './p2p-event.service'
import { projectAgentDeletedEvent } from './p2p-agent-projection-events'
import { projectAgentSharedEvent } from './p2p-agent-projection-shared'
import { readPayloadString } from './p2p-agent-projection-utils'

export function reconcileAgentSharedResources(workspaceId: string): void {
  const terminalByAgent = new Map<string, WorkspaceEvent>()
  const packageJsonByAgent = new Map<string, string>()

  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Agent') continue

      const assistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId

      if (event.eventType === 'Updated') {
        const packageJson = readPayloadString(event.payload, 'package_json')
        if (packageJson) {
          packageJsonByAgent.set(assistantId, packageJson)
        }
        continue
      }

      if (
        event.eventType !== 'Shared' &&
        event.eventType !== 'Created' &&
        event.eventType !== 'Deleted'
      ) {
        continue
      }

      terminalByAgent.set(assistantId, event)
    }

    if (batch.length < 200) break
  }

  for (const event of terminalByAgent.values()) {
    if (event.eventType === 'Deleted') {
      projectAgentDeletedEvent(event)
      continue
    }

    const assistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
    const packageJson =
      readPayloadString(event.payload, 'package_json') ?? packageJsonByAgent.get(assistantId)
    projectAgentSharedEvent({
      ...event,
      payload: packageJson ? { ...event.payload, package_json: packageJson } : event.payload,
    })
  }
}

export function resolveAuthoritativeSessionIds(
  existing: string[] | undefined,
  payload: Record<string, unknown>,
): string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(payload, 'session_ids')) {
    return existing
  }
  if (!Array.isArray(payload.session_ids)) {
    return undefined
  }
  const next = [
    ...new Set(
      payload.session_ids.filter((item): item is string => typeof item === 'string'),
    ),
  ]
  return next.length > 0 ? next : undefined
}
