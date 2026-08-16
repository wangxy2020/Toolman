import { randomUUID } from 'node:crypto'
import { toErrorMessage, type P2pMailboxSharedAgent } from '@toolman/shared'
import { P2pSharedResourceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getDefaultWorkspace } from '../workspace.service'
import { logStructured } from '../structured-log.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { getWorkspaceLatestSeq } from './p2p-event.service'
import { readAgentShareMetadata } from './agent-share/metadata'
import { readSharedAgentModelId } from './agent-share/model'
import { listAssistantSessionIds, listAssistantSessionTitles } from './agent-share/sessions'
import { sendEventsBatchChunked } from './p2p-events-channel'
import type { RemoteWorkspaceEventWire } from './p2p-sync-protocol'

function listingSessionIds(metadata: ReturnType<typeof readAgentShareMetadata>): string[] {
  if (metadata.sessionIds && metadata.sessionIds.length > 0) return metadata.sessionIds
  return [
    ...new Set([
      ...Object.keys(metadata.sessionTitles ?? {}),
      ...Object.keys(metadata.sessionPermissions ?? {}),
    ]),
  ]
}

export function listActiveAgentShareListings(workspaceId: string): P2pMailboxSharedAgent[] {
  const sharedRepo = new P2pSharedResourceRepository(getDatabase())
  const ownerDeviceId = getP2pDeviceInfo().deviceId
  const listings: P2pMailboxSharedAgent[] = []

  for (const row of sharedRepo.listByWorkspace(workspaceId)) {
    if (row.resourceType !== 'Agent' || row.status !== 'active') continue
    const metadata = readAgentShareMetadata(row.metadataJson)
    const assistantId = row.localResourceId ?? row.id
    let sessionIds = listingSessionIds(metadata)
    const sourceWorkspaceId = metadata.sourceWorkspaceId ?? getDefaultWorkspace()?.id
    if (sessionIds.length === 0 && sourceWorkspaceId) {
      sessionIds = listAssistantSessionIds(sourceWorkspaceId, assistantId)
    }
    const localTitles = sourceWorkspaceId
      ? listAssistantSessionTitles(sourceWorkspaceId, assistantId, sessionIds)
      : {}
    const sessionTitles = {
      ...localTitles,
      ...metadata.sessionTitles,
    }
    listings.push({
      id: assistantId,
      name: row.name,
      sessionIds,
      sessionTitles: Object.keys(sessionTitles).length > 0 ? sessionTitles : undefined,
      sessionPermissions: metadata.sessionPermissions,
      sharedBy: row.sharedBy,
      ownerDeviceId,
      referencedModelId: readSharedAgentModelId(metadata),
    })
  }

  return listings
}

export function buildAgentShareListingWires(workspaceId: string): RemoteWorkspaceEventWire[] {
  const latestSeq = Math.max(getWorkspaceLatestSeq(workspaceId), 1)
  const sourceDeviceId = getP2pDeviceInfo().deviceId
  return listActiveAgentShareListings(workspaceId).map((listing) => ({
    eventId: randomUUID(),
    workspaceId,
    seq: latestSeq,
    resourceType: 'Agent',
    resourceId: listing.id,
    operatorId: listing.sharedBy ?? sourceDeviceId,
    eventType: 'Updated',
    payloadJson: JSON.stringify({
      assistant_id: listing.id,
      name: listing.name,
      session_ids: listing.sessionIds,
      ...(listing.sessionTitles ? { session_titles: listing.sessionTitles } : {}),
      ...(listing.sessionPermissions ? { session_permissions: listing.sessionPermissions } : {}),
    }),
    payloadHash: '',
    prevEventHash: null,
    timestamp: Date.now(),
    sourceDeviceId,
  }))
}

export async function sendAgentShareListings(
  peerDeviceId: string,
  workspaceId: string,
): Promise<number> {
  try {
    const events = buildAgentShareListingWires(workspaceId)
    if (events.length === 0) return 0
    await sendEventsBatchChunked(peerDeviceId, workspaceId, events)
    return events.length
  } catch (error) {
    logStructured(
      'p2p',
      'warn',
      `agent share listing send failed: workspaceId=${workspaceId} error=${toErrorMessage(error, String(error))}`,
    )
    return 0
  }
}
