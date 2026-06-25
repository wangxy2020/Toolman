import { P2pMemberRepository, P2pWorkspaceRepository } from '@toolman/db'
import { toErrorMessage } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { ensurePeerReadyForWorkspace, isPeerConnected } from './p2p-connection.service'
import { isP2pPeerDiscoverableOnline } from './p2p-discovery.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { isPeerTrusted, trustPeerSilentlyForWorkspaceMesh } from './p2p-peer.service'

const meshReconcileInFlight = new Map<string, Promise<void>>()
const meshReconcileLastRunAt = new Map<string, number>()
const MESH_RECONCILE_COOLDOWN_MS = 5_000

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

export async function reconcileWorkspaceMemberMesh(
  workspaceId: string,
  options?: { immediate?: boolean },
): Promise<void> {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const inFlight = meshReconcileInFlight.get(workspaceId)
  if (inFlight) {
    await inFlight
    return
  }

  if (!options?.immediate) {
    const lastRun = meshReconcileLastRunAt.get(workspaceId) ?? 0
    if (Date.now() - lastRun < MESH_RECONCILE_COOLDOWN_MS) {
      return
    }
  }

  const promise = reconcileWorkspaceMemberMeshNow(workspaceId, workspace.ownerDeviceId).finally(() => {
    meshReconcileInFlight.delete(workspaceId)
    meshReconcileLastRunAt.set(workspaceId, Date.now())
  })
  meshReconcileInFlight.set(workspaceId, promise)
  await promise
}

async function reconcileWorkspaceMemberMeshNow(
  workspaceId: string,
  ownerDeviceId: string,
): Promise<void> {
  const device = getP2pDeviceInfo()
  const isOwner = ownerDeviceId === device.deviceId
  const members = getMemberRepo().listByWorkspace(workspaceId, 'active')

  for (const member of members) {
    if (member.deviceId === device.deviceId) continue

    if (isOwner) {
      if (!isPeerTrusted(workspaceId, member.deviceId)) continue
    } else {
      trustPeerSilentlyForWorkspaceMesh(workspaceId, member.deviceId, member.displayName)
    }

    if (!isP2pPeerDiscoverableOnline(member.deviceId)) {
      continue
    }

    if (isPeerConnected(member.deviceId)) {
      try {
        await ensurePeerReadyForWorkspace(member.deviceId, workspaceId)
      } catch (error) {
        const message = toErrorMessage(error, 'mesh workspace key sync failed')
        console.warn(`[p2p] member mesh workspace sync failed for ${member.deviceId}: ${message}`)
      }
      continue
    }

    try {
      await ensurePeerReadyForWorkspace(member.deviceId, workspaceId)
    } catch (error) {
      const message = toErrorMessage(error, 'mesh connect failed')
      console.warn(`[p2p] member mesh connect failed for ${member.deviceId}: ${message}`)
    }
  }
}
