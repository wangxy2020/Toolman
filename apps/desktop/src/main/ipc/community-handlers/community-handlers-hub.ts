import { IpcChannel } from '@toolman/shared'
import { installCommunityResource } from '../../services/community/community-install.service'
import { syncCommunityProfileToYjs } from '../../services/community/community-yjs-provider'
import {
  completeInstall,
  createResource,
  createReview,
  deleteResource,
  deleteReview,
  dislikeResource,
  exportCommunityKnowledgeBundle,
  exportCommunityMcpPackage,
  favoriteResource,
  getHubConfig,
  getHubHealth,
  getHubStatus,
  getFederationStatus,
  getResource,
  getUserMe,
  likeResource,
  listInstallHistory,
  listResources,
  listReviews,
  patchResource,
  patchReview,
  prepareCommunityKnowledgePackage,
  prepareCommunityMcpPackage,
  prepareCommunitySkillPackage,
  prepareCommunityWorkflowPackage,
  publishResource,
  rollbackInstall,
  syncHubPeering,
  updateHubConfig,
  updateUserMe,
} from '../../services/community/community-ipc.facade'
import {
  downloadCommunityResourcePackageForReview,
  openCommunityResourcePackageForReview,
} from '../../services/community/community-resource-package-review.service'
import { communityHandler } from './community-handlers-utils'
import type { HandlerFn } from './community-handlers-utils'

export const communityHubHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.CommunityHubHealth]: communityHandler(() => getHubHealth()),
  [IpcChannel.CommunityHubStatus]: communityHandler(async () => getHubStatus()),
  [IpcChannel.CommunityHubConfigGet]: communityHandler(async () => getHubConfig()),
  [IpcChannel.CommunityHubConfigUpdate]: communityHandler(async (input) => updateHubConfig(input)),
  [IpcChannel.CommunityFederationStatusGet]: communityHandler(async () => getFederationStatus()),
  [IpcChannel.CommunityHubPeeringSync]: communityHandler(async () => syncHubPeering()),

  [IpcChannel.CommunityUserMe]: communityHandler(() => getUserMe()),
  [IpcChannel.CommunityUserMeUpdate]: communityHandler(async (input) => {
    const profile = await updateUserMe(input)
    syncCommunityProfileToYjs(profile)
    return profile
  }),

  [IpcChannel.CommunityResourceList]: communityHandler((input) => listResources(input)),
  [IpcChannel.CommunityResourceGet]: communityHandler((input) => getResource(input)),
  [IpcChannel.CommunityResourceCreate]: communityHandler((input) => createResource(input)),
  [IpcChannel.CommunityResourcePublish]: communityHandler((input) => publishResource(input)),
  [IpcChannel.CommunityKnowledgeBundleExport]: communityHandler((input) =>
    exportCommunityKnowledgeBundle(input),
  ),
  [IpcChannel.CommunityMcpPackageExport]: communityHandler((input) =>
    exportCommunityMcpPackage(input),
  ),
  [IpcChannel.CommunityMcpPackagePrepare]: communityHandler((input) =>
    prepareCommunityMcpPackage(input),
  ),
  [IpcChannel.CommunitySkillPackagePrepare]: communityHandler((input) =>
    prepareCommunitySkillPackage(input),
  ),
  [IpcChannel.CommunityWorkflowPackagePrepare]: communityHandler((input) =>
    prepareCommunityWorkflowPackage(input),
  ),
  [IpcChannel.CommunityKnowledgePackagePrepare]: communityHandler((input) =>
    prepareCommunityKnowledgePackage(input),
  ),
  [IpcChannel.CommunityResourcePatch]: communityHandler((input) => patchResource(input)),
  [IpcChannel.CommunityResourcePackageReviewOpen]: communityHandler((input) =>
    openCommunityResourcePackageForReview(input),
  ),
  [IpcChannel.CommunityResourcePackageReviewDownload]: communityHandler((input) =>
    downloadCommunityResourcePackageForReview(input),
  ),
  [IpcChannel.CommunityResourceDelete]: communityHandler((input) => deleteResource(input)),
  [IpcChannel.CommunityResourceLike]: communityHandler((input) => likeResource(input)),
  [IpcChannel.CommunityResourceDislike]: communityHandler((input) => dislikeResource(input)),
  [IpcChannel.CommunityResourceFavorite]: communityHandler((input) => favoriteResource(input)),

  [IpcChannel.CommunityInstall]: communityHandler((input) => installCommunityResource(input)),
  [IpcChannel.CommunityInstallComplete]: communityHandler((input) => completeInstall(input)),
  [IpcChannel.CommunityInstallRollback]: communityHandler((input) => rollbackInstall(input)),
  [IpcChannel.CommunityInstallHistory]: communityHandler((input) => listInstallHistory(input)),

  [IpcChannel.CommunityReviewCreate]: communityHandler((input) => createReview(input)),
  [IpcChannel.CommunityReviewList]: communityHandler((input) => listReviews(input)),
  [IpcChannel.CommunityReviewPatch]: communityHandler((input) => patchReview(input)),
  [IpcChannel.CommunityReviewDelete]: communityHandler((input) => deleteReview(input)),
}
