import {
  P2pMemberRepository,
  P2pPeerRepository,
  P2pWorkspaceRepository,
  createP2pDeviceIdentityRepository,
  p2pPeerNodes,
} from '@toolman/db'
import type { DiscoveredNode } from '@toolman/shared'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceId } from './p2p-device-identity.service'
import { listP2pDiscoveredNodes } from './p2p-discovery.service'
import { resolveSharedMembershipWorkspaceId } from './p2p-member-shared'

export function getPeerRepo(): P2pPeerRepository {
  return new P2pPeerRepository(getDatabase())
}

export function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

export function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

export function resolveDiscoveredNode(deviceId: string): DiscoveredNode | null {
  return listP2pDiscoveredNodes(false).find((node) => node.deviceId === deviceId) ?? null
}

export function isValidEd25519PublicKeyB64(value: string | null | undefined): value is string {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length < 40) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return false
  }
  try {
    return Buffer.from(trimmed, 'base64').length === 32
  } catch {
    return false
  }
}

function findStoredPeerPublicKey(deviceId: string): string | null {
  const rows = getDatabase()
    .select({ publicKey: p2pPeerNodes.publicKey })
    .from(p2pPeerNodes)
    .where(eq(p2pPeerNodes.deviceId, deviceId))
    .all()

  for (const row of rows) {
    if (isValidEd25519PublicKeyB64(row.publicKey)) {
      return row.publicKey
    }
  }
  return null
}

export function resolveWorkspaceIdForPeerConnection(
  peerDeviceId: string,
  workspaceId?: string,
): string | undefined {
  const sharedWorkspaceId = resolveSharedMembershipWorkspaceId(peerDeviceId)
  if (sharedWorkspaceId) return sharedWorkspaceId

  if (workspaceId) return workspaceId

  const localDeviceId = getP2pDeviceId()
  const ownedWorkspaces = getWorkspaceRepo().listByOwnerDevice(localDeviceId)
  if (ownedWorkspaces.length === 0) return undefined

  for (const workspace of ownedWorkspaces) {
    const member = getMemberRepo().findByWorkspaceAndDevice(workspace.id, peerDeviceId)
    if (member?.status === 'invited') return workspace.id
  }

  for (const workspace of ownedWorkspaces) {
    const member = getMemberRepo().findByWorkspaceAndDevice(workspace.id, peerDeviceId)
    if (!member || member.status !== 'active') return workspace.id
  }

  if (ownedWorkspaces.length === 1) {
    return ownedWorkspaces[0].id
  }

  return undefined
}

export function resolvePeerPublicKey(deviceId: string, fingerprint: string): string {
  const repo = createP2pDeviceIdentityRepository(getDatabase())
  const row = repo.getByDeviceId(deviceId)
  if (isValidEd25519PublicKeyB64(row?.publicKey)) {
    return row!.publicKey
  }

  const fromPeer = findStoredPeerPublicKey(deviceId)
  if (fromPeer) return fromPeer

  if (isValidEd25519PublicKeyB64(fingerprint)) {
    return fingerprint
  }

  return row?.publicKey ?? fingerprint
}

export function registerRemoteDevicePublicKey(
  workspaceId: string,
  deviceId: string,
  publicKey: string,
  options?: { displayName?: string; trusted?: boolean },
): void {
  if (!isValidEd25519PublicKeyB64(publicKey)) return

  const localDeviceId = getP2pDeviceId()
  if (deviceId === localDeviceId) return

  const node = resolveDiscoveredNode(deviceId)
  const existing = getPeerRepo().findByWorkspaceAndDevice(workspaceId, deviceId)
  getPeerRepo().upsert({
    workspaceId,
    deviceId,
    displayName: options?.displayName ?? existing?.displayName ?? node?.userName ?? '成员',
    deviceName: node?.deviceName ?? existing?.deviceName ?? deviceId.slice(0, 8),
    publicKey,
    online: node?.online ?? existing?.online ?? false,
    lastSeenAt: node ? new Date(node.lastSeenAt) : existing?.lastSeenAt ?? undefined,
    connectionState: existing?.connectionState ?? null,
    trusted: options?.trusted ?? existing?.trusted ?? false,
  })
}

export function resolvePeerDisplayName(workspaceId: string, deviceId: string, fallback: string): string {
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, deviceId)
  return member?.displayName ?? fallback
}
