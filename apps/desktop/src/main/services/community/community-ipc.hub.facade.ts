import {
  CommunityHubHealthOutputSchema,
  CommunityHubStatusOutputSchema,
  CommunityHubConfigUpdateInputSchema,
  CommunityFederationStatusOutputSchema,
} from '@toolman/shared'

import { isCommunityHubConfigEditable, readCommunityHubConfig, writeCommunityHubConfig } from './community-hub.config'
import { readCommunityFederationConfig } from './community-federation.config'
import {
  getCommunityHubPeeringSyncState,
  runCommunityHubPeeringSync,
  startCommunityHubPeeringSync,
  stopCommunityHubPeeringSync,
} from './community-hub-peering.service'
import { syncLibp2pBootstrapFromPeerHubs } from './community-libp2p-bootstrap-sync.service'
import { getFederatedCatalogStats } from './community-federated-catalog.service'
import { readLibp2pConfig } from '../p2p/p2p-libp2p.config'
import {
  getCommunityHubStatus,
  recoverCommunityHubConnection,
} from './community-bridge.service'
import { withRefreshedHubClient } from './community-ipc.facade-core'

export async function getHubStatus() {
  await recoverCommunityHubConnection()
  return CommunityHubStatusOutputSchema.parse(getCommunityHubStatus())
}

export async function getHubHealth() {
  return withRefreshedHubClient(async (client) => {
    const data = await client.health()
    return CommunityHubHealthOutputSchema.parse({
      status: data.status,
      version: data.version,
      db: data.db,
      dataDir: data.data_dir,
      requireReview: data.require_review,
      userCount: data.user_count,
      resourceCount: data.resource_count,
      federationPeering: data.federation_peering,
    })
  })
}

export function getHubConfig() {
  return readCommunityHubConfig()
}

export function updateHubConfig(input: unknown) {
  const parsed = CommunityHubConfigUpdateInputSchema.parse(input)
  const saved = writeCommunityHubConfig(parsed)
  stopCommunityHubPeeringSync()
  startCommunityHubPeeringSync()
  return saved
}

export function getFederationStatus() {
  return CommunityFederationStatusOutputSchema.parse({
    hubConfigEditable: isCommunityHubConfigEditable(),
    hubConfig: readCommunityHubConfig(),
    federationConfig: readCommunityFederationConfig(),
    syncState: getCommunityHubPeeringSyncState(),
    federatedCatalogEntryCount: getFederatedCatalogStats().entryCount,
    libp2pBootstrapCount: readLibp2pConfig().bootstrapMultiaddrs?.length ?? 0,
  })
}

export async function syncHubPeering() {
  await runCommunityHubPeeringSync()
  const added = await syncLibp2pBootstrapFromPeerHubs()
  return {
    syncState: getCommunityHubPeeringSyncState(),
    federatedCatalogEntryCount: getFederatedCatalogStats().entryCount,
    libp2pBootstrapAdded: added,
  }
}
