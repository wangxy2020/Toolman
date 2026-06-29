export {
  resolveWorkspaceIdForPeerConnection,
  resolvePeerPublicKey,
  registerRemoteDevicePublicKey,
} from './p2p-peer-keys'

export { upsertPeerFromDiscovery } from './p2p-peer-registry'

export {
  isPeerTrusted,
  assertPeerTrustedForSync,
  ensureOwnerPeerTrustedForSync,
  trustPeerSilentlyForWorkspaceMesh,
  revokePeerTrustForWorkspace,
  clearPeerTrustPrompt,
  prepareJoinPeerTrustPrompt,
  promptPeerTrustIfNeeded,
  trustP2pPeerDevice,
  listPendingTrustPrompts,
  reemitPendingTrustPromptsToRenderer,
  resetPeerTrustPrompts,
} from './p2p-peer-trust'

export {
  handlePeerDiscoveryOffline,
  handlePeerDiscoveryOnline,
  handlePeerConnectionChange,
} from './p2p-peer-discovery-handlers'
