import {
  CommunityBoardMessageDeleteInputSchema,
  CommunityCidSetEnabledInputSchema,
  CommunityYjsSetEnabledInputSchema,
  IpcChannel,
  ipcErr,
  ipcOk,
  type IpcError,
  type IpcResult,
} from '@toolman/shared'

import { CommunityHttpError, humanizeCommunityFetchError } from '../services/community/community-http.client'
import { installCommunityResource } from '../services/community/community-install.service'
import {
  removeCommunityBoardMessageFromYjs,
  syncCommunityBoardMessageToYjs,
  syncCommunityProfileToYjs,
} from '../services/community/community-yjs-provider'
import { getCommunityYjsStatus, setCommunityYjsEnabled } from '../services/community/community-yjs-bridge.service'
import { getCommunityCidProviderStatus, setCommunityCidDistributionEnabled } from '../services/community/community-cid-provider.service'
import {
  CommunityHubUnavailableError,
  acceptTaskApplication,
  acceptTaskDelivery,
  applyTask,
  approveModerationResource,
  approveModerationTask,
  rejectModerationTask,
  appointCommunityAdmin,
  banModerationUser,
  banModerationDevice,
  unbanModerationUser,
  unbanModerationDevice,
  cancelTask,
  completeInstall,
  createModerationReport,
  createOrder,
  createResource,
  createReview,
  createTask,
  createTaskReview,
  deleteResource,
  deleteTask,
  deleteReview,
  deliverTask,
  favoriteNewsArticle,
  fetchNewsSource,
  createNewsComment,
  createComment,
  createBoardMessage,
  createNewsSource,
  deleteComment,
  deleteBoardMessage,
  deleteNewsSource,
  dislikeBoardMessage,
  dislikeNewsArticle,
  dislikeResource,
  favoriteBoardMessage,
  favoriteResource,
  getHubHealth,
  getHubStatus,
  getHubConfig,
  updateHubConfig,
  getFederationStatus,
  syncHubPeering,
  getNewsArticle,
  getOrder,
  getResource,
  getTask,
  getUserMe,
  likeBoardMessage,
  likeNewsArticle,
  likeResource,
  listInstallHistory,
  listCommunityAdmins,
  listModerationLogs,
  listModerationReports,
  listNewsArticles,
  listNewsComments,
  listComments,
  countComments,
  listBoardMessages,
  listNewsSources,
  listRecommendedNews,
  listResources,
  listReviews,
  listTaskApplications,
  listTaskReviews,
  listTasks,
  patchResource,
  patchBoardMessage,
  patchReview,
  patchTask,
  exportCommunityKnowledgeBundle,
  exportCommunityMcpPackage,
  prepareCommunityMcpPackage,
  prepareCommunitySkillPackage,
  prepareCommunityWorkflowPackage,
  publishResource,
  publishTask,
  rejectTaskDelivery,
  resolveModerationReport,
  revokeCommunityAdmin,
  rollbackInstall,
  scanModerationOnline,
  searchCommunityUsers,
  suspendModerationResource,
  touchCommunityPresenceHeartbeat,
  updateOrderStatus,
  updateUserMe,
} from '../services/community/community-ipc.facade'
import {
  downloadCommunityResourcePackageForReview,
  openCommunityResourcePackageForReview,
} from '../services/community/community-resource-package-review.service'

type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

function mapCommunityError(error: unknown): IpcResult<never> {
  if (error instanceof CommunityHubUnavailableError) {
    return ipcErr({
      code: 'INTERNAL_ERROR',
      message: error.message,
      retryable: true,
    })
  }

  if (error instanceof CommunityHttpError) {
    const code: IpcError['code'] =
      error.code === 'NOT_FOUND' || error.status === 404
        ? 'NOT_FOUND'
        : error.code === 'CONFLICT' || error.status === 409
          ? 'CONFLICT'
          : error.code === 'RATE_LIMITED' || error.status === 429
            ? 'RATE_LIMITED'
            : error.code === 'VALIDATION_ERROR'
              ? 'VALIDATION_ERROR'
              : error.status === 401 || error.status === 403 || error.code === 'FORBIDDEN'
                ? 'PERMISSION_DENIED'
                : 'INTERNAL_ERROR'

    return ipcErr({
      code,
      message: error.message,
      retryable:
        error.status >= 500 || error.status === 429 || error.code === 'HUB_CONNECTION_FAILED',
    })
  }

  const message =
    error instanceof Error ? humanizeCommunityFetchError(error) : 'Community request failed'
  return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
}

function communityHandler(handler: (input: unknown) => Promise<unknown>): HandlerFn {
  return async (input) => {
    try {
      return ipcOk(await handler(input))
    } catch (error) {
      return mapCommunityError(error)
    }
  }
}

export const communityHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
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

  [IpcChannel.CommunityNewsSourceList]: communityHandler(() => listNewsSources()),
  [IpcChannel.CommunityNewsSourceCreate]: communityHandler((input) => createNewsSource(input)),
  [IpcChannel.CommunityNewsSourceDelete]: communityHandler((input) => deleteNewsSource(input)),
  [IpcChannel.CommunityNewsSourceFetch]: communityHandler((input) => fetchNewsSource(input)),
  [IpcChannel.CommunityNewsList]: communityHandler((input) => listNewsArticles(input)),
  [IpcChannel.CommunityNewsGet]: communityHandler((input) => getNewsArticle(input)),
  [IpcChannel.CommunityNewsRecommended]: communityHandler(() => listRecommendedNews()),
  [IpcChannel.CommunityNewsFavorite]: communityHandler((input) => favoriteNewsArticle(input)),
  [IpcChannel.CommunityNewsLike]: communityHandler((input) => likeNewsArticle(input)),
  [IpcChannel.CommunityNewsDislike]: communityHandler((input) => dislikeNewsArticle(input)),
  [IpcChannel.CommunityNewsCommentList]: communityHandler((input) => listNewsComments(input)),
  [IpcChannel.CommunityNewsCommentCreate]: communityHandler((input) => createNewsComment(input)),

  [IpcChannel.CommunityCommentList]: communityHandler((input) => listComments(input)),
  [IpcChannel.CommunityCommentCreate]: communityHandler((input) => createComment(input)),
  [IpcChannel.CommunityCommentDelete]: communityHandler((input) => deleteComment(input)),
  [IpcChannel.CommunityCommentCount]: communityHandler((input) => countComments(input)),

  [IpcChannel.CommunityBoardMessageList]: communityHandler((input) => listBoardMessages(input)),
  [IpcChannel.CommunityBoardMessageCreate]: communityHandler(async (input) => {
    const message = await createBoardMessage(input)
    syncCommunityBoardMessageToYjs(message)
    return message
  }),
  [IpcChannel.CommunityBoardMessageLike]: communityHandler((input) => likeBoardMessage(input)),
  [IpcChannel.CommunityBoardMessageDislike]: communityHandler((input) => dislikeBoardMessage(input)),
  [IpcChannel.CommunityBoardMessageFavorite]: communityHandler((input) =>
    favoriteBoardMessage(input),
  ),
  [IpcChannel.CommunityBoardMessageDelete]: communityHandler(async (input) => {
    const result = await deleteBoardMessage(input)
    const parsed = CommunityBoardMessageDeleteInputSchema.parse(input)
    removeCommunityBoardMessageFromYjs(parsed.messageId)
    return result
  }),
  [IpcChannel.CommunityBoardMessagePatch]: communityHandler(async (input) => {
    const message = await patchBoardMessage(input)
    syncCommunityBoardMessageToYjs(message)
    return message
  }),

  [IpcChannel.CommunityTaskList]: communityHandler((input) => listTasks(input)),
  [IpcChannel.CommunityTaskGet]: communityHandler((input) => getTask(input)),
  [IpcChannel.CommunityTaskCreate]: communityHandler((input) => createTask(input)),
  [IpcChannel.CommunityTaskPatch]: communityHandler((input) => patchTask(input)),
  [IpcChannel.CommunityTaskPublish]: communityHandler((input) => publishTask(input)),
  [IpcChannel.CommunityTaskCancel]: communityHandler((input) => cancelTask(input)),
  [IpcChannel.CommunityTaskDelete]: communityHandler((input) => deleteTask(input)),
  [IpcChannel.CommunityTaskApply]: communityHandler((input) => applyTask(input)),
  [IpcChannel.CommunityTaskApplicationsList]: communityHandler((input) =>
    listTaskApplications(input),
  ),
  [IpcChannel.CommunityTaskApplicationAccept]: communityHandler((input) =>
    acceptTaskApplication(input),
  ),
  [IpcChannel.CommunityTaskDeliver]: communityHandler((input) => deliverTask(input)),
  [IpcChannel.CommunityTaskAcceptDelivery]: communityHandler((input) =>
    acceptTaskDelivery(input),
  ),
  [IpcChannel.CommunityTaskRejectDelivery]: communityHandler((input) =>
    rejectTaskDelivery(input),
  ),
  [IpcChannel.CommunityTaskReviewCreate]: communityHandler((input) => createTaskReview(input)),
  [IpcChannel.CommunityTaskReviewList]: communityHandler((input) => listTaskReviews(input)),

  [IpcChannel.CommunityOrderCreate]: communityHandler((input) => createOrder(input)),
  [IpcChannel.CommunityOrderGet]: communityHandler((input) => getOrder(input)),
  [IpcChannel.CommunityOrderUpdateStatus]: communityHandler((input) => updateOrderStatus(input)),

  [IpcChannel.CommunityModerationReport]: communityHandler((input) => createModerationReport(input)),
  [IpcChannel.CommunityModerationReportList]: communityHandler((input) =>
    listModerationReports(input),
  ),
  [IpcChannel.CommunityModerationReportResolve]: communityHandler((input) =>
    resolveModerationReport(input),
  ),
  [IpcChannel.CommunityModerationResourceSuspend]: communityHandler((input) =>
    suspendModerationResource(input),
  ),
  [IpcChannel.CommunityModerationResourceApprove]: communityHandler((input) =>
    approveModerationResource(input),
  ),
  [IpcChannel.CommunityModerationTaskApprove]: communityHandler((input) =>
    approveModerationTask(input),
  ),
  [IpcChannel.CommunityModerationTaskReject]: communityHandler((input) =>
    rejectModerationTask(input),
  ),
  [IpcChannel.CommunityModerationUserBan]: communityHandler((input) => banModerationUser(input)),
  [IpcChannel.CommunityModerationUserUnban]: communityHandler((input) => unbanModerationUser(input)),
  [IpcChannel.CommunityModerationDeviceBan]: communityHandler((input) => banModerationDevice(input)),
  [IpcChannel.CommunityModerationDeviceUnban]: communityHandler((input) =>
    unbanModerationDevice(input),
  ),
  [IpcChannel.CommunityModerationLogsList]: communityHandler((input) => listModerationLogs(input)),
  [IpcChannel.CommunityModerationScan]: communityHandler(() => scanModerationOnline()),
  [IpcChannel.CommunityPresenceHeartbeat]: communityHandler(() =>
    touchCommunityPresenceHeartbeat(),
  ),

  [IpcChannel.CommunityAdminList]: communityHandler(() => listCommunityAdmins()),
  [IpcChannel.CommunityAdminSearch]: communityHandler((input) => searchCommunityUsers(input)),
  [IpcChannel.CommunityAdminAppoint]: communityHandler((input) => appointCommunityAdmin(input)),
  [IpcChannel.CommunityAdminRevoke]: communityHandler((input) => revokeCommunityAdmin(input)),

  [IpcChannel.CommunityYjsGetStatus]: async () => {
    try {
      return ipcOk(getCommunityYjsStatus())
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to read Yjs status'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.CommunityYjsSetEnabled]: communityHandler(async (input) => {
    const parsed = CommunityYjsSetEnabledInputSchema.parse(input)
    return setCommunityYjsEnabled(parsed.enabled)
  }),

  [IpcChannel.CommunityCidGetStatus]: async () => {
    try {
      return ipcOk(getCommunityCidProviderStatus())
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to read CID status'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.CommunityCidSetEnabled]: communityHandler(async (input) => {
    const parsed = CommunityCidSetEnabledInputSchema.parse(input)
    return setCommunityCidDistributionEnabled(parsed.enabled)
  }),
}
