import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import type { P2pGroupChatMessage } from '@toolman/shared'
import { P2pMemberRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'
import { listP2pConnections, ensurePeerReadyForWorkspace, isPeerConnected } from './p2p-connection.service'
import { isP2pPeerDiscoverableOnline } from './p2p-discovery.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { encodeReplicationMessage } from './p2p-sync-protocol'
import { isOwnerPeerConnected } from './p2p-sync-sequencing'
import {
  buildGroupChatRelayExcludeDeviceIds,
  shouldRelayGroupChatAfterReceive,
} from './p2p-group-chat-relay'
import {
  signGroupChatClearWireMessage,
  signGroupChatWireMessage,
} from './p2p-group-chat-signing.service'
import { P2P_EVENTS_CHANNEL } from './p2p-group-chat-constants'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

export async function relayMessageToPeers(
  message: P2pGroupChatMessage,
  excludeDeviceIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const device = getP2pDeviceInfo()
  const memberRepo = getMemberRepo()
  const peerDeviceIds = new Set(
    memberRepo
      .listByWorkspace(message.workspaceId, 'active')
      .filter((item) => item.deviceId !== device.deviceId)
      .map((item) => item.deviceId),
  )

  const connections = await listP2pConnections()
  for (const item of connections) {
    if (item.state !== 'connected' || item.peerDeviceId === device.deviceId) continue
    peerDeviceIds.add(item.peerDeviceId)
  }

  const signedPayload = Buffer.from(
    JSON.stringify(signGroupChatWireMessage(message)),
    'utf8',
  )

  await Promise.all(
    [...peerDeviceIds]
      .filter((peerDeviceId) => !excludeDeviceIds.has(peerDeviceId))
      .map(async (peerDeviceId) => {
        if (
          !isP2pPeerDiscoverableOnline(peerDeviceId) &&
          !isPeerConnected(peerDeviceId)
        ) {
          return
        }
        try {
          await ensurePeerReadyForWorkspace(peerDeviceId, message.workspaceId)
          await P2pBridge.connectionSend(peerDeviceId, P2P_EVENTS_CHANNEL, signedPayload)
        } catch (error) {
          const errMessage = toErrorMessage(error, 'relay failed')
          logStructured('p2p', 'warn', `group chat relay to ${peerDeviceId.slice(0, 8)} failed: ${errMessage}`)
        }
      }),
  )
}

export async function relayClearToPeers(workspaceId: string): Promise<void> {
  const device = getP2pDeviceInfo()
  const memberRepo = getMemberRepo()
  const peerDeviceIds = new Set(
    memberRepo
      .listByWorkspace(workspaceId, 'active')
      .filter((item) => item.deviceId !== device.deviceId)
      .map((item) => item.deviceId),
  )

  const connections = await listP2pConnections()
  for (const item of connections) {
    if (item.state !== 'connected' || item.peerDeviceId === device.deviceId) continue
    peerDeviceIds.add(item.peerDeviceId)
  }

  const signed = signGroupChatClearWireMessage(workspaceId)
  const payload = encodeReplicationMessage(signed)

  await Promise.all(
    [...peerDeviceIds].map(async (peerDeviceId) => {
      if (
        !isP2pPeerDiscoverableOnline(peerDeviceId) &&
        !isPeerConnected(peerDeviceId)
      ) {
        return
      }
      try {
        await ensurePeerReadyForWorkspace(peerDeviceId, workspaceId)
        await P2pBridge.connectionSend(peerDeviceId, P2P_EVENTS_CHANNEL, payload)
      } catch (error) {
        const errMessage = toErrorMessage(error, 'relay failed')
        logStructured('p2p', 'warn', `group chat clear relay to ${peerDeviceId.slice(0, 8)} failed: ${errMessage}`)
      }
    }),
  )
}

export async function maybeRelayGroupChatAfterReceive(
  senderDeviceId: string,
  message: P2pGroupChatMessage,
): Promise<void> {
  const { P2pWorkspaceRepository } = await import('@toolman/db')
  const workspace = new P2pWorkspaceRepository(getDatabase()).findById(message.workspaceId)
  if (!workspace) return

  const localDeviceId = getP2pDeviceInfo().deviceId
  const connections = await listP2pConnections()
  const ownerPeerConnected = isOwnerPeerConnected(message.workspaceId, connections)

  if (
    !shouldRelayGroupChatAfterReceive({
      localDeviceId,
      ownerDeviceId: workspace.ownerDeviceId,
      senderDeviceId,
      ownerPeerConnected,
    })
  ) {
    return
  }

  void relayMessageToPeers(
    message,
    buildGroupChatRelayExcludeDeviceIds(localDeviceId, senderDeviceId),
  )
}
