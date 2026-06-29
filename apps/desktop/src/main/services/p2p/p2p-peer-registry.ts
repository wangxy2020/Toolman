import type { DiscoveredNode, P2pConnectionState } from '@toolman/shared'
import {
  getPeerRepo,
  resolvePeerDisplayName,
  resolvePeerPublicKey,
} from './p2p-peer-keys'

export function upsertPeerFromDiscovery(
  workspaceId: string,
  node: DiscoveredNode,
  connectionState: P2pConnectionState | null = null,
): void {
  getPeerRepo().upsert({
    workspaceId,
    deviceId: node.deviceId,
    displayName: resolvePeerDisplayName(workspaceId, node.deviceId, node.userName),
    deviceName: node.deviceName,
    publicKey: resolvePeerPublicKey(node.deviceId, node.publicKeyFingerprint),
    online: connectionState ? connectionState === 'connected' && node.online : node.online,
    lastSeenAt: new Date(node.lastSeenAt),
    connectionState,
  })
}
