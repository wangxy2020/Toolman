import { logStructured } from '../structured-log.service'
import { fireAndForget } from '../../lib/fire-and-forget'
import { toErrorMessage } from '@toolman/shared'
import { eq } from 'drizzle-orm'
import { p2pPeerNodes } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceId } from './p2p-device-identity.service'
import { isP2pPeerDiscoverableOnline } from './p2p-discovery.service'
import {
  getMemberRepo,
  getPeerRepo,
  getWorkspaceRepo,
} from './p2p-peer-keys'
import { handlePeerConnectionChange } from './p2p-peer-trust'

export function handlePeerDiscoveryOffline(peerDeviceId: string): void {
  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return
  if (isP2pPeerDiscoverableOnline(peerDeviceId)) return

  const peerRepo = getPeerRepo()
  const rows = getDatabase()
    .select({ workspaceId: p2pPeerNodes.workspaceId })
    .from(p2pPeerNodes)
    .where(eq(p2pPeerNodes.deviceId, peerDeviceId))
    .all()

  for (const row of rows) {
    peerRepo.updateConnectionState(row.workspaceId, peerDeviceId, 'closed', false)
  }

  void import('./p2p-connection.service').then((module) => {
    void module.disconnectP2pPeer(peerDeviceId).catch(() => undefined)
  })
}

export function handlePeerDiscoveryOnline(peerDeviceId: string): void {
  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return

  const memberRepo = getMemberRepo()
  const workspaceRepo = getWorkspaceRepo()
  const memberships = memberRepo.listActiveMembershipsByDevice(localDeviceId)

  fireAndForget('p2p', (async () => {
    const connectionModule = await import('./p2p-connection.service')
    await connectionModule.resetStalePeerConnection(peerDeviceId)

    let ownerReconcileQueued = false
    for (const membership of memberships) {
      const workspace = workspaceRepo.findById(membership.workspaceId)
      if (!workspace) continue

      const peerIsMember = memberRepo.findByWorkspaceAndDevice(membership.workspaceId, peerDeviceId)
      const peerIsOwner = workspace.ownerDeviceId === peerDeviceId
      if (workspace.ownerDeviceId === localDeviceId) {
        if (!ownerReconcileQueued) {
          ownerReconcileQueued = true
          const module = await import('./p2p-member.service')
          void module.runOwnerPeerReconcileTick()
        }
        continue
      }

      if (!peerIsMember && !peerIsOwner) continue

      try {
        if (peerIsOwner) {
          const module = await import('./p2p-member.service')
          await module.ensureMemberConnectsToOwner(workspace.id, { immediate: true })
        } else {
          const module = await import('./p2p-member-mesh.service')
          await module.reconcileWorkspaceMemberMesh(workspace.id, { immediate: true })
        }
      } catch (error) {
        const message = toErrorMessage(error, 'discovery online reconnect failed')
        logStructured('p2p', 'warn', `discovery online reconnect failed for ${peerDeviceId.slice(0, 8)} in ${workspace.id}: ${message}`)
      }
    }
  })())
}

export { handlePeerConnectionChange }
