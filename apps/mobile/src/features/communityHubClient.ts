/**
 * Lightweight Community Hub HTTP client for mobile list views and publish.
 * Desktop uses Electron IPC → Hub; mobile hits Hub Base URL (default local sidecar).
 */

export type {
  CommunityCardIconKind,
  CommunityCommentItem,
  CommunityHubHealth,
  CommunityInteractionKind,
  CommunityInteractionResult,
  CommunityListItem,
  CommunityReportReason,
  CommunityReportTargetType,
  CommunityResourceType,
  CommunityTaskType,
  FederationPeeringInfo,
} from './communityHubClient-types'

export {
  communityHubRequestCandidates,
  communityHubRequestUrl,
  isCommunityHubHealthBody,
  probeCommunityHub,
} from './communityHubClient-http'

export {
  fetchCommunityMessages,
  fetchCommunityResources,
  fetchCommunityTasks,
} from './communityHubClient-fetch'

export {
  applyInteractionToItem,
  buildBoardReplyTarget,
  buildResourceCommentTarget,
  createCommunityComment,
  createCommunityModerationReport,
  deleteCommunityComment,
  listCommunityComments,
  resolveCommentTarget,
  resolveReportTarget,
  toggleCommunityInteraction,
  type CommunityCommentTarget,
} from './communityHubClient-interactions'

export {
  createCommunityBoardMessage,
  createCommunityResource,
  createCommunityTask,
  fetchCommunityHubHealth,
  fetchFederationCatalogCount,
  fetchFederationPeering,
  publishCommunityTask,
} from './communityHubClient-mutate'
