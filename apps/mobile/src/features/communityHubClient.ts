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
  CommunityNewsSource,
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
  fetchCommunityNews,
  fetchCommunityNewsArticle,
  fetchCommunityResources,
  fetchCommunityTasks,
} from './communityHubClient-fetch'

export {
  applyInteractionToItem,
  buildBoardReplyTarget,
  buildNewsCommentTarget,
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
