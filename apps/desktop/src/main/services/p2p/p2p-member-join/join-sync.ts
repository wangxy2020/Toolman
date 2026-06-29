import { toErrorMessage } from '@toolman/shared'
import type { P2pMember } from '@toolman/shared'
import { logStructured } from '../../structured-log.service'
import { getP2pDeviceInfo } from '../p2p-device-identity.service'
import {
  requestSnapshotFromOwner,
  syncWithPeer,
  awaitJoinerEventCatchUp,
} from '../p2p-sync.service'
import { reconcileWorkspaceMemberMesh } from '../p2p-member-mesh.service'
import type { decodeInviteToken } from '../p2p-invite.token'
import { ensureJoinPeerConnection } from './join-connection'
import { tryNotifyOwnerOfJoin } from './join-notify'

type InvitePayload = ReturnType<typeof decodeInviteToken>

async function finishJoinSync(
  payload: InvitePayload,
  offerSdp: string | undefined,
): Promise<void> {
  if (payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return
  }

  const connection = await ensureJoinPeerConnection(payload, offerSdp)

  if (connection.lastError && !connection.connected) {
    logStructured('p2p', 'warn', `join completed locally; peer connection pending (${connection.lastError})`)
  }

  void requestSnapshotFromOwner(payload.workspaceId, payload.ownerDeviceId).catch((error) => {
    const message = toErrorMessage(error, 'request snapshot failed')
    logStructured('p2p', 'warn', `snapshot request after join failed: ${message}`)
  })
}

export function scheduleJoinPeerSync(
  payload: InvitePayload,
  offerSdp: string | undefined,
  member: P2pMember,
): void {
  void (async () => {
    const notifyPromise = tryNotifyOwnerOfJoin(payload, member)

    await finishJoinSync(payload, offerSdp)

    try {
      await notifyPromise
    } catch (error) {
      const message = toErrorMessage(error, 'notify owner failed')
      logStructured('p2p', 'warn', `publish join to owner failed: ${message}`)
    }

    if (payload.ownerDeviceId !== getP2pDeviceInfo().deviceId) {
      try {
        await syncWithPeer(payload.workspaceId, payload.ownerDeviceId)
        await awaitJoinerEventCatchUp(payload.workspaceId)
        await reconcileWorkspaceMemberMesh(payload.workspaceId)
      } catch (error) {
        const message = toErrorMessage(error, 'post-join sync failed')
        logStructured('p2p', 'warn', `post-join event sync failed: ${message}`)
      }
    }
  })()
}
