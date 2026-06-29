import type { WorkspaceEvent } from '@toolman/shared'
import { P2pMemberRepository } from '@toolman/db'
import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { getDatabase } from '../../bootstrap/database'
import { ensurePeerReadyForWorkspace, listP2pConnections } from './p2p-connection.service'
import { markP2pEventSynced } from './p2p-event.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { isPeerTrusted } from './p2p-peer.service'
import { sendEventsBatchChunked } from './p2p-events-channel'
import { workspaceEventToWire } from './p2p-sync-protocol'
import {
  getWorkspaceOwnerDeviceId,
  isLocalWorkspaceOwner,
} from './p2p-sync-sequencing'
import { getCursorRepo } from './p2p-sync-state'

export function onLocalP2pEventAppended(event: WorkspaceEvent): void {
  void replicateLocalP2pEvent(event)
}

export async function replicateLocalP2pEvent(event: WorkspaceEvent): Promise<void> {
  const device = getP2pDeviceInfo()
  const ownerDeviceId = getWorkspaceOwnerDeviceId(event.workspaceId)
  const memberDeviceIds = new Set(
    new P2pMemberRepository(getDatabase())
      .listByWorkspace(event.workspaceId, 'active')
      .map((item) => item.deviceId),
  )
  const connections = await listP2pConnections()

  const isJoinerOwnEvent =
    Boolean(ownerDeviceId) &&
    event.sourceDeviceId === device.deviceId &&
    !isLocalWorkspaceOwner(event.workspaceId)

  const peers = connections.filter(
    (item) =>
      item.state === 'connected' &&
      item.peerDeviceId !== device.deviceId &&
      memberDeviceIds.has(item.peerDeviceId) &&
      !(isJoinerOwnEvent && item.peerDeviceId === ownerDeviceId),
  )

  if (peers.length === 0) return

  const wireEvent = workspaceEventToWire(event)
  await Promise.all(
    peers.map(async (peer) => {
      if (!isPeerTrusted(event.workspaceId, peer.peerDeviceId)) return
      try {
        await ensurePeerReadyForWorkspace(peer.peerDeviceId, event.workspaceId)
        await sendEventsBatchChunked(peer.peerDeviceId, event.workspaceId, [wireEvent])
        getCursorRepo().updateSentSeq(event.workspaceId, peer.peerDeviceId, event.seq)
        markP2pEventSynced(event.eventId)
      } catch (error) {
        logStructured('p2p', 'warn', `replicate to ${peer.peerDeviceId} failed: ${toErrorMessage(error, 'Failed to replicate event')}`)
      }
    }),
  )
}
