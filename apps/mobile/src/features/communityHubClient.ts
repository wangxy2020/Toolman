/**
 * Lightweight Community Hub HTTP client for mobile list views and publish.
 * Desktop uses Electron IPC → Hub; mobile hits Hub Base URL (default local sidecar).
 */

export type {
  CommunityCardIconKind,
  CommunityHubHealth,
  CommunityListItem,
  CommunityNewsSource,
  CommunityResourceType,
  CommunityTaskType,
  FederationPeeringInfo,
} from './communityHubClient-types'

export {
  communityHubRequestUrl,
  isCommunityHubHealthBody,
  probeCommunityHub,
} from './communityHubClient-http'

export {
  fetchCommunityMessages,
  fetchCommunityNews,
  fetchCommunityResources,
  fetchCommunityTasks,
} from './communityHubClient-fetch'

export {
  createCommunityBoardMessage,
  createCommunityNewsSource,
  createCommunityResource,
  createCommunityTask,
  deleteCommunityNewsSource,
  fetchCommunityHubHealth,
  fetchCommunityNewsSource,
  fetchFederationCatalogCount,
  fetchFederationPeering,
  listCommunityNewsSources,
  publishCommunityTask,
} from './communityHubClient-mutate'
