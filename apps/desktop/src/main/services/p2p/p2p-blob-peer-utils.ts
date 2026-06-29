import { P2pMemberRepository, P2pWorkspaceRepository } from '@toolman/db'
import { blobExists } from '../blob.service'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { isPeerTrusted } from './p2p-peer.service'
import { listP2pConnections } from './p2p-connection.service'
import { sleep } from './p2p-blob-transfer-state'

export function listActiveWorkspacePeerIds(workspaceId: string): string[] {
  const device = getP2pDeviceInfo()
  return new P2pMemberRepository(getDatabase())
    .listByWorkspace(workspaceId, 'active')
    .filter((member) => member.deviceId !== device.deviceId)
    .map((member) => member.deviceId)
}

export function canRequestBlobFromPeer(workspaceId: string, peerDeviceId: string): boolean {
  return isPeerTrusted(workspaceId, peerDeviceId)
}

export function canServeBlobToPeer(workspaceId: string, peerDeviceId: string): boolean {
  return canRequestBlobFromPeer(workspaceId, peerDeviceId)
}

export async function waitForBlob(contentHash: string, maxWaitMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    if (blobExists(contentHash)) return true
    await sleep(250)
  }
  return blobExists(contentHash)
}

export function listBlobFetchPeerCandidates(
  workspaceId: string,
  preferredPeerDeviceId: string | undefined,
  connections: Awaited<ReturnType<typeof listP2pConnections>>,
): string[] {
  const device = getP2pDeviceInfo()
  const workspace = new P2pWorkspaceRepository(getDatabase()).findById(workspaceId)
  const ordered: string[] = []
  const seen = new Set<string>()
  const add = (peerDeviceId?: string | null) => {
    if (!peerDeviceId || peerDeviceId === device.deviceId || seen.has(peerDeviceId)) return
    seen.add(peerDeviceId)
    ordered.push(peerDeviceId)
  }

  add(preferredPeerDeviceId)
  add(workspace?.ownerDeviceId)
  for (const peerDeviceId of listActiveWorkspacePeerIds(workspaceId)) {
    add(peerDeviceId)
  }
  for (const connection of connections) {
    if (connection.state === 'connected') {
      add(connection.peerDeviceId)
    }
  }

  return ordered
}
