import {
  IpcChannel,
  type CommunityFederationStatusOutput,
  type CommunityHubConfig,
  type CommunityHubConfigUpdateInput,
  type CommunityHubHealthOutput,
  type CommunityHubStatusOutput,
} from '@toolman/shared'
import { invokeIpc } from './community-api-ipc'

export async function getCommunityHubStatus(): Promise<CommunityHubStatusOutput> {
  return invokeIpc(IpcChannel.CommunityHubStatus)
}

export async function getCommunityHubHealth(): Promise<CommunityHubHealthOutput> {
  return invokeIpc(IpcChannel.CommunityHubHealth)
}

export async function getCommunityHubConfig(): Promise<CommunityHubConfig> {
  return invokeIpc(IpcChannel.CommunityHubConfigGet)
}

export async function updateCommunityHubConfig(
  input: CommunityHubConfigUpdateInput,
): Promise<CommunityHubConfig> {
  return invokeIpc(IpcChannel.CommunityHubConfigUpdate, input)
}

export async function getCommunityFederationStatus(): Promise<CommunityFederationStatusOutput> {
  return invokeIpc(IpcChannel.CommunityFederationStatusGet)
}

export async function syncCommunityHubPeering(): Promise<{
  syncState: CommunityFederationStatusOutput['syncState']
  federatedCatalogEntryCount: number
  libp2pBootstrapAdded: number
}> {
  return invokeIpc(IpcChannel.CommunityHubPeeringSync)
}
