import {
  IpcChannel,
  type CommunityHubHealthOutput,
  type CommunityHubStatusOutput,
  type CommunityInstallHistoryInput,
  type CommunityInstallItem,
  type CommunityInstallInput,
  type CommunityInstallOutput,
  type CommunityBoardMessage,
  type CommunityBoardMessageCreateInput,
  type CommunityBoardMessageListInput,
  type CommunityNewsArticle,
  type CommunityNewsComment,
  type CommunityNewsCommentCreateInput,
  type CommunityNewsCommentListInput,
  type CommunityNewsInteractionOutput,
  type CommunityNewsListInput,
  type CommunityNewsRecommendedOutput,
  type CommunityNewsSource,
  type CommunityNewsSourceFetchInput,
  type CommunityResourceDetail,
  type CommunityResourceCreateInput,
  type CommunityResourceInteractionOutput,
  type CommunityResourceItem,
  type CommunityResourcePublishInput,
  type CommunityResourceListInput,
  type CommunityResourceListOutput,
  type CommunityTaskApplication,
  type CommunityTaskApplicationAcceptInput,
  type CommunityTaskApplicationsListInput,
  type CommunityTaskApplyInput,
  type CommunityTaskCreateInput,
  type CommunityTaskDeliverInput,
  type CommunityTaskDelivery,
  type CommunityTaskItem,
  type CommunityTaskListInput,
  type CommunityTaskListOutput,
  type CommunityTaskRejectDeliveryInput,
  type CommunityTaskReviewCreateInput,
  type CommunityTaskReviewItem,
  type CommunityTaskReviewListInput,
  type CommunityUserProfile,
  type CommunityUserMeUpdateInput,
  type CommunityModerationReport,
  type CommunityModerationReportCreateInput,
  type CommunityModerationReportListInput,
  type CommunityModerationReportResolveInput,
  type CommunityModerationLogsListInput,
  type CommunityModerationLog,
  type CommunityModerationResourceActionInput,
  type CommunityModerationScanOutput,
  type CommunityModeratorUser,
  type CommunityUserSearchInput,
  type CommunityModerationUserBanInput,
  type CommunityModerationUserUnbanInput,
  type CommunityModerationDeviceBanInput,
  type CommunityModerationDeviceUnbanInput,
  type IpcResult,
} from '@toolman/shared'

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data
}

async function invokeIpc<T>(channel: IpcChannel, input?: unknown): Promise<T> {
  return unwrap((await window.api.invoke(channel, input)) as IpcResult<T>)
}

export async function getCommunityHubStatus(): Promise<CommunityHubStatusOutput> {
  return invokeIpc(IpcChannel.CommunityHubStatus)
}

export async function getCommunityHubHealth(): Promise<CommunityHubHealthOutput> {
  return invokeIpc(IpcChannel.CommunityHubHealth)
}

export async function listCommunityResources(
  input: CommunityResourceListInput = {},
): Promise<CommunityResourceListOutput> {
  return invokeIpc(IpcChannel.CommunityResourceList, input)
}

export async function getCommunityResource(id: string): Promise<CommunityResourceDetail> {
  return invokeIpc(IpcChannel.CommunityResourceGet, { id })
}

export async function createCommunityResource(
  input: CommunityResourceCreateInput,
): Promise<CommunityResourceItem> {
  return invokeIpc(IpcChannel.CommunityResourceCreate, input)
}

export async function publishCommunityResource(
  input: CommunityResourcePublishInput,
): Promise<CommunityResourceItem> {
  return invokeIpc(IpcChannel.CommunityResourcePublish, input)
}

export async function deleteCommunityResource(id: string): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityResourceDelete, { id })
}

export async function likeCommunityResource(
  resourceId: string,
): Promise<CommunityResourceInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityResourceLike, { resourceId })
}

export async function dislikeCommunityResource(
  resourceId: string,
): Promise<CommunityResourceInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityResourceDislike, { resourceId })
}

export async function favoriteCommunityResource(
  resourceId: string,
): Promise<CommunityResourceInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityResourceFavorite, { resourceId })
}

export async function installCommunityResource(
  input: CommunityInstallInput,
): Promise<CommunityInstallOutput> {
  return invokeIpc(IpcChannel.CommunityInstall, input)
}

export async function listCommunityInstallHistory(
  input: CommunityInstallHistoryInput = {},
): Promise<{ items: CommunityInstallItem[] }> {
  return invokeIpc(IpcChannel.CommunityInstallHistory, input)
}

export async function listCommunityNewsArticles(
  input: CommunityNewsListInput = {},
): Promise<{ items: CommunityNewsArticle[] }> {
  return invokeIpc(IpcChannel.CommunityNewsList, input)
}

export async function getCommunityNewsArticle(id: string): Promise<CommunityNewsArticle> {
  return invokeIpc(IpcChannel.CommunityNewsGet, { id })
}

export async function listRecommendedCommunityNews(): Promise<CommunityNewsRecommendedOutput> {
  return invokeIpc(IpcChannel.CommunityNewsRecommended)
}

export async function favoriteCommunityNewsArticle(
  articleId: string,
): Promise<CommunityNewsInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityNewsFavorite, { articleId })
}

export async function likeCommunityNewsArticle(
  articleId: string,
): Promise<CommunityNewsInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityNewsLike, { articleId })
}

export async function dislikeCommunityNewsArticle(
  articleId: string,
): Promise<CommunityNewsInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityNewsDislike, { articleId })
}

export async function listCommunityNewsSources(): Promise<{ items: CommunityNewsSource[] }> {
  return invokeIpc(IpcChannel.CommunityNewsSourceList)
}

export async function createCommunityNewsSource(
  input: import('@toolman/shared').CommunityNewsSourceCreateInput,
): Promise<CommunityNewsSource> {
  return invokeIpc(IpcChannel.CommunityNewsSourceCreate, input)
}

export async function deleteCommunityNewsSource(sourceId: string): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityNewsSourceDelete, { sourceId })
}

export async function fetchCommunityNewsSource(
  input: CommunityNewsSourceFetchInput,
): Promise<unknown> {
  return invokeIpc(IpcChannel.CommunityNewsSourceFetch, input)
}

export async function listCommunityNewsComments(
  input: CommunityNewsCommentListInput,
): Promise<{ items: CommunityNewsComment[] }> {
  return invokeIpc(IpcChannel.CommunityNewsCommentList, input)
}

export async function createCommunityNewsComment(
  input: CommunityNewsCommentCreateInput,
): Promise<CommunityNewsComment> {
  return invokeIpc(IpcChannel.CommunityNewsCommentCreate, input)
}

export async function listCommunityComments(
  input: import('@toolman/shared').CommunityCommentListInput,
): Promise<{ items: import('@toolman/shared').CommunityComment[] }> {
  return invokeIpc(IpcChannel.CommunityCommentList, input)
}

export async function createCommunityComment(
  input: import('@toolman/shared').CommunityCommentCreateInput,
): Promise<import('@toolman/shared').CommunityComment> {
  return invokeIpc(IpcChannel.CommunityCommentCreate, input)
}

export async function deleteCommunityComment(
  commentId: string,
): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityCommentDelete, { commentId })
}

export async function countCommunityComments(
  input: import('@toolman/shared').CommunityCommentCountInput,
): Promise<import('@toolman/shared').CommunityCommentCountOutput> {
  return invokeIpc(IpcChannel.CommunityCommentCount, input)
}

export async function listCommunityBoardMessages(
  input: CommunityBoardMessageListInput = {},
): Promise<{ items: CommunityBoardMessage[] }> {
  return invokeIpc(IpcChannel.CommunityBoardMessageList, input)
}

export async function createCommunityBoardMessage(
  input: CommunityBoardMessageCreateInput,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessageCreate, input)
}

export async function likeCommunityBoardMessage(
  messageId: string,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessageLike, { messageId })
}

export async function dislikeCommunityBoardMessage(
  messageId: string,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessageDislike, { messageId })
}

export async function favoriteCommunityBoardMessage(
  messageId: string,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessageFavorite, { messageId })
}

export async function deleteCommunityBoardMessage(
  messageId: string,
): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityBoardMessageDelete, { messageId })
}

export async function createCommunityModerationReport(
  input: CommunityModerationReportCreateInput,
): Promise<CommunityModerationReport> {
  return invokeIpc(IpcChannel.CommunityModerationReport, input)
}

export async function listCommunityModerationReports(
  input: CommunityModerationReportListInput = {},
): Promise<{ items: CommunityModerationReport[] }> {
  return invokeIpc(IpcChannel.CommunityModerationReportList, input)
}

export async function resolveCommunityModerationReport(
  input: CommunityModerationReportResolveInput,
): Promise<CommunityModerationReport> {
  return invokeIpc(IpcChannel.CommunityModerationReportResolve, input)
}

export async function suspendCommunityModerationResource(
  input: CommunityModerationResourceActionInput,
): Promise<{ id: string; title: string; status: string }> {
  return invokeIpc(IpcChannel.CommunityModerationResourceSuspend, input)
}

export async function approveCommunityModerationResource(
  input: CommunityModerationResourceActionInput,
): Promise<{ id: string; title: string; status: string }> {
  return invokeIpc(IpcChannel.CommunityModerationResourceApprove, input)
}

export async function banCommunityModerationUser(
  input: CommunityModerationUserBanInput,
): Promise<{ banned: boolean }> {
  return invokeIpc(IpcChannel.CommunityModerationUserBan, input)
}

export async function unbanCommunityModerationUser(
  input: CommunityModerationUserUnbanInput,
): Promise<{ unbanned: boolean }> {
  return invokeIpc(IpcChannel.CommunityModerationUserUnban, input)
}

export async function banCommunityModerationDevice(
  input: CommunityModerationDeviceBanInput,
): Promise<{ banned: boolean }> {
  return invokeIpc(IpcChannel.CommunityModerationDeviceBan, input)
}

export async function unbanCommunityModerationDevice(
  input: CommunityModerationDeviceUnbanInput,
): Promise<{ unbanned: boolean }> {
  return invokeIpc(IpcChannel.CommunityModerationDeviceUnban, input)
}

export async function listCommunityModerationLogs(
  input: CommunityModerationLogsListInput = {},
): Promise<{ items: CommunityModerationLog[] }> {
  return invokeIpc(IpcChannel.CommunityModerationLogsList, input)
}

export async function scanCommunityModerationOnline(): Promise<CommunityModerationScanOutput> {
  return invokeIpc(IpcChannel.CommunityModerationScan)
}

export async function touchCommunityPresenceHeartbeat(): Promise<{ ok: boolean }> {
  return invokeIpc(IpcChannel.CommunityPresenceHeartbeat)
}

export async function listCommunityAdmins(): Promise<{ items: CommunityModeratorUser[] }> {
  return invokeIpc(IpcChannel.CommunityAdminList)
}

export async function searchCommunityUsers(
  input: CommunityUserSearchInput,
): Promise<{ items: CommunityModeratorUser[] }> {
  return invokeIpc(IpcChannel.CommunityAdminSearch, input)
}

export async function appointCommunityAdmin(
  userId: string,
): Promise<CommunityModeratorUser> {
  return invokeIpc(IpcChannel.CommunityAdminAppoint, { userId })
}

export async function revokeCommunityAdmin(
  userId: string,
): Promise<CommunityModeratorUser> {
  return invokeIpc(IpcChannel.CommunityAdminRevoke, { userId })
}

export async function listCommunityTasks(
  input: CommunityTaskListInput = {},
): Promise<CommunityTaskListOutput> {
  return invokeIpc(IpcChannel.CommunityTaskList, input)
}

export async function getCommunityTask(id: string): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskGet, { id })
}

export async function getCommunityUserMe(): Promise<CommunityUserProfile> {
  return invokeIpc(IpcChannel.CommunityUserMe)
}

export async function updateCommunityUserMe(
  input: CommunityUserMeUpdateInput,
): Promise<CommunityUserProfile> {
  return invokeIpc(IpcChannel.CommunityUserMeUpdate, input)
}

export async function createCommunityTask(
  input: CommunityTaskCreateInput,
): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskCreate, input)
}

export async function publishCommunityTask(id: string): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskPublish, { id })
}

export async function cancelCommunityTask(id: string): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskCancel, { id })
}

export async function applyCommunityTask(
  input: CommunityTaskApplyInput,
): Promise<unknown> {
  return invokeIpc(IpcChannel.CommunityTaskApply, input)
}

export async function listCommunityTaskApplications(
  input: CommunityTaskApplicationsListInput,
): Promise<{ items: CommunityTaskApplication[] }> {
  return invokeIpc(IpcChannel.CommunityTaskApplicationsList, input)
}

export async function acceptCommunityTaskApplication(
  input: CommunityTaskApplicationAcceptInput,
): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskApplicationAccept, input)
}

export async function deliverCommunityTask(
  input: CommunityTaskDeliverInput,
): Promise<CommunityTaskDelivery> {
  return invokeIpc(IpcChannel.CommunityTaskDeliver, input)
}

export async function acceptCommunityTaskDelivery(id: string): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskAcceptDelivery, { id })
}

export async function rejectCommunityTaskDelivery(
  input: CommunityTaskRejectDeliveryInput,
): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskRejectDelivery, input)
}

export async function createCommunityTaskReview(
  input: CommunityTaskReviewCreateInput,
): Promise<unknown> {
  return invokeIpc(IpcChannel.CommunityTaskReviewCreate, input)
}

export async function listCommunityTaskReviews(
  input: CommunityTaskReviewListInput,
): Promise<{ items: CommunityTaskReviewItem[] }> {
  return invokeIpc(IpcChannel.CommunityTaskReviewList, input)
}
