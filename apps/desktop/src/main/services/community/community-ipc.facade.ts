import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import {
  CommunityHubHealthOutputSchema,
  CommunityHubStatusOutputSchema,
  CommunityInstallCompleteInputSchema,
  CommunityInstallCompleteOutputSchema,
  CommunityInstallHistoryInputSchema,
  CommunityInstallHistoryOutputSchema,
  CommunityInstallInputSchema,
  CommunityInstallOutputSchema,
  CommunityInstallRollbackInputSchema,
  CommunityAdminAppointInputSchema,
  CommunityAdminRevokeInputSchema,
  CommunityModerationLogsListInputSchema,
  CommunityModerationLogsListOutputSchema,
  CommunityModerationReportCreateInputSchema,
  CommunityModerationReportListInputSchema,
  CommunityModerationReportListOutputSchema,
  CommunityModerationReportResolveInputSchema,
  CommunityModerationReportSchema,
  CommunityModerationResourceActionInputSchema,
  CommunityModerationResourceActionOutputSchema,
  CommunityModerationScanOutputSchema,
  CommunityModerationUserBanInputSchema,
  CommunityModerationUserUnbanInputSchema,
  CommunityModerationDeviceBanInputSchema,
  CommunityModerationDeviceUnbanInputSchema,
  CommunityModeratorListOutputSchema,
  CommunityModeratorUserSchema,
  CommunityUserSearchInputSchema,
  CommunityNewsInteractionInputSchema,
  CommunityNewsInteractionOutputSchema,
  CommunityNewsCommentCreateInputSchema,
  CommunityNewsCommentListInputSchema,
  CommunityNewsCommentListOutputSchema,
  CommunityNewsCommentSchema,
  CommunityCommentCountInputSchema,
  CommunityCommentCountOutputSchema,
  CommunityCommentCreateInputSchema,
  CommunityCommentDeleteInputSchema,
  CommunityCommentListInputSchema,
  CommunityCommentListOutputSchema,
  CommunityCommentSchema,
  CommunityBoardMessageCreateInputSchema,
  CommunityBoardMessageDeleteInputSchema,
  CommunityBoardMessageDeleteOutputSchema,
  CommunityBoardMessageDislikeInputSchema,
  CommunityBoardMessageFavoriteInputSchema,
  CommunityBoardMessageLikeInputSchema,
  CommunityBoardMessageListInputSchema,
  CommunityBoardMessageListOutputSchema,
  CommunityBoardMessageSchema,
  CommunityNewsListInputSchema,
  CommunityNewsListOutputSchema,
  CommunityNewsArticleSchema,
  CommunityNewsGetInputSchema,
  CommunityNewsRecommendedOutputSchema,
  CommunityNewsSourceCreateInputSchema,
  CommunityNewsSourceDeleteInputSchema,
  CommunityNewsSourceFetchInputSchema,
  CommunityNewsSourceListOutputSchema,
  CommunityNewsSourceSchema,
  CommunityOrderCreateInputSchema,
  CommunityOrderGetInputSchema,
  CommunityOrderItemSchema,
  CommunityOrderUpdateStatusInputSchema,
  CommunityResourceCreateInputSchema,
  CommunityResourceDeleteInputSchema,
  CommunityResourceDeleteOutputSchema,
  CommunityResourceDetailSchema,
  CommunityResourceInteractionInputSchema,
  CommunityResourceInteractionOutputSchema,
  CommunityResourceGetInputSchema,
  CommunityResourceItemSchema,
  CommunityResourceListInputSchema,
  CommunityResourceListOutputSchema,
  CommunityResourcePatchInputSchema,
  CommunityResourcePublishInputSchema,
  CommunityReviewCreateInputSchema,
  CommunityReviewDeleteInputSchema,
  CommunityReviewDeleteOutputSchema,
  CommunityReviewItemSchema,
  CommunityReviewListInputSchema,
  CommunityReviewListOutputSchema,
  CommunityReviewPatchInputSchema,
  CommunityTaskApplicationAcceptInputSchema,
  CommunityTaskApplicationsListInputSchema,
  CommunityTaskApplicationsListOutputSchema,
  CommunityTaskApplyInputSchema,
  CommunityTaskCreateInputSchema,
  CommunityTaskDeliverInputSchema,
  CommunityTaskDeliverySchema,
  CommunityTaskGetInputSchema,
  CommunityTaskIdInputSchema,
  CommunityTaskItemSchema,
  CommunityTaskListInputSchema,
  CommunityTaskListOutputSchema,
  CommunityTaskPatchInputSchema,
  CommunityTaskRejectDeliveryInputSchema,
  CommunityTaskReviewCreateInputSchema,
  CommunityTaskReviewListInputSchema,
  CommunityTaskReviewListOutputSchema,
  CommunityUserMeUpdateInputSchema,
  CommunityUserProfileSchema,
} from '@toolman/shared'

import { buildApiQuery, fromApiJson, toApiJson } from './community-case'
import {
  getCommunityHubStatus,
  getCommunityHttpClient,
  markCommunityHubOfflineReadOnly,
} from './community-bridge.service'
import type { CommunityHttpClient } from './community-http.client'
import { readCommunityHubCache, writeCommunityHubCache } from './community-hub-cache.service'

export class CommunityHubUnavailableError extends Error {
  constructor() {
    super('Community hub is not running')
    this.name = 'CommunityHubUnavailableError'
  }
}

function requireClient(): CommunityHttpClient {
  const client = getCommunityHttpClient()
  if (!client) {
    throw new CommunityHubUnavailableError()
  }
  return client
}

async function fetchWithHubCache<T>(
  cacheKey: string,
  fetch: (client: CommunityHttpClient) => Promise<T>,
): Promise<T> {
  const client = getCommunityHttpClient()
  if (!client) {
    const cached = readCommunityHubCache<T>(cacheKey)
    if (cached != null && getCommunityHubStatus().offlineReadOnly) {
      return cached
    }
    throw new CommunityHubUnavailableError()
  }

  try {
    const data = await fetch(client)
    writeCommunityHubCache(cacheKey, data)
    return data
  } catch (error) {
    const cached = readCommunityHubCache<T>(cacheKey)
    if (cached != null) {
      markCommunityHubOfflineReadOnly(error instanceof Error ? error.message : String(error))
      return cached
    }
    throw error
  }
}

function asItems<T>(data: unknown): T[] {
  if (!Array.isArray(data)) return []
  return data.map((item) => fromApiJson<T>(item))
}

function parseTaskItem(value: unknown) {
  const item = fromApiJson(value) as Record<string, unknown>

  if (Array.isArray(item.attachmentsJson)) {
    item.attachmentsJson = {}
  }

  return CommunityTaskItemSchema.parse(item)
}

function marketplacePublishSegment(resourceType: string): string {
  switch (resourceType) {
    case 'mcp':
      return 'mcp'
    case 'skill':
      return 'skills'
    case 'workflow':
      return 'workflows'
    case 'knowledge':
      return 'knowledge'
    default:
      throw new Error(`Publishing is not supported for resource type: ${resourceType}`)
  }
}

export function getHubStatus() {
  return CommunityHubStatusOutputSchema.parse(getCommunityHubStatus())
}

export async function getHubHealth() {
  const client = requireClient()
  const data = await client.health()
  return CommunityHubHealthOutputSchema.parse({
    status: data.status,
    version: data.version,
    db: data.db,
    dataDir: data.data_dir,
    requireReview: data.require_review,
    userCount: data.user_count,
    resourceCount: data.resource_count,
  })
}

export async function getUserMe() {
  const client = requireClient()
  const data = await client.get<unknown>('/api/v1/users/me')
  return CommunityUserProfileSchema.parse(fromApiJson(data))
}

export async function updateUserMe(input: unknown) {
  const parsed = CommunityUserMeUpdateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.patch<unknown>('/api/v1/users/me', toApiJson(parsed))
  return CommunityUserProfileSchema.parse(fromApiJson(data))
}

export async function listResources(input: unknown) {
  const parsed = CommunityResourceListInputSchema.parse(input)
  const query = buildApiQuery({
    resource_type: parsed.resourceType,
    category: parsed.category,
    tags: parsed.tags,
    q: parsed.q,
    sort: parsed.sort,
    visibility: parsed.visibility,
    status: parsed.status,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const cacheKey = `marketplace-resources${query}`
  const data = await fetchWithHubCache(cacheKey, (client) =>
    client.get<unknown[]>(`/api/v1/marketplace/resources${query}`),
  )
  return CommunityResourceListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityResourceItemSchema.parse(fromApiJson(item))),
  })
}

export async function getResource(input: unknown) {
  const parsed = CommunityResourceGetInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown>(`/api/v1/marketplace/resources/${parsed.id}`)
  return CommunityResourceDetailSchema.parse(fromApiJson(data))
}

export async function createResource(input: unknown) {
  const parsed = CommunityResourceCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/marketplace/resources', toApiJson(parsed))
  return CommunityResourceItemSchema.parse(fromApiJson(data))
}

export async function publishResource(input: unknown) {
  const parsed = CommunityResourcePublishInputSchema.parse(input)
  const client = requireClient()
  const resource = await client.get<{ resource_type: string }>(
    `/api/v1/marketplace/resources/${parsed.id}`,
  )
  const segment = marketplacePublishSegment(resource.resource_type)
  const packageBytes = await readFile(parsed.packagePath)
  const data = await client.postMultipart<unknown>(
    `/api/v1/marketplace/${segment}/${parsed.id}/publish`,
    [
      { name: 'version', value: parsed.version },
      ...(parsed.changelog ? [{ name: 'changelog', value: parsed.changelog }] : []),
      {
        name: 'package',
        value: packageBytes,
        filename: parsed.originalFilename ?? basename(parsed.packagePath),
      },
    ],
  )
  return CommunityResourceItemSchema.parse(fromApiJson(data))
}

export async function patchResource(input: unknown) {
  const parsed = CommunityResourcePatchInputSchema.parse(input)
  const { id, ...patch } = parsed
  const client = requireClient()
  const data = await client.patch<unknown>(
    `/api/v1/marketplace/resources/${id}`,
    toApiJson(patch as Record<string, unknown>),
  )
  return CommunityResourceItemSchema.parse(fromApiJson(data))
}

export async function deleteResource(input: unknown) {
  const parsed = CommunityResourceDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/marketplace/resources/${parsed.id}`)
  return CommunityResourceDeleteOutputSchema.parse({ deleted: true })
}

export async function likeResource(input: unknown) {
  const parsed = CommunityResourceInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/marketplace/resources/${parsed.resourceId}/like`,
  )
  return CommunityResourceInteractionOutputSchema.parse(fromApiJson(data))
}

export async function dislikeResource(input: unknown) {
  const parsed = CommunityResourceInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/marketplace/resources/${parsed.resourceId}/dislike`,
  )
  return CommunityResourceInteractionOutputSchema.parse(fromApiJson(data))
}

export async function favoriteResource(input: unknown) {
  const parsed = CommunityResourceInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/marketplace/resources/${parsed.resourceId}/favorite`,
  )
  return CommunityResourceInteractionOutputSchema.parse(fromApiJson(data))
}

export async function startInstall(input: unknown) {
  const parsed = CommunityInstallInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/install/${parsed.resourceType}/${parsed.resourceId}`,
    toApiJson({
      version: parsed.version,
      workspaceId: parsed.workspaceId,
      options: parsed.options,
    }),
  )
  return CommunityInstallOutputSchema.parse(fromApiJson(data))
}

export async function completeInstall(input: unknown) {
  const parsed = CommunityInstallCompleteInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/install/${parsed.installId}/complete`,
    toApiJson({
      status: parsed.status,
      localRef: parsed.localRef,
      errorMessage: parsed.errorMessage,
    }),
  )
  return CommunityInstallCompleteOutputSchema.parse(fromApiJson(data))
}

export async function rollbackInstall(input: unknown) {
  const parsed = CommunityInstallRollbackInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/install/${parsed.installId}/rollback`)
  return CommunityInstallCompleteOutputSchema.parse(fromApiJson(data))
}

export async function listInstallHistory(input: unknown) {
  const parsed = CommunityInstallHistoryInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    resource_type: parsed.resourceType,
    workspace_id: parsed.workspaceId,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/install/history${query}`)
  return CommunityInstallHistoryOutputSchema.parse({ items: asItems(data) })
}

export async function createReview(input: unknown) {
  const parsed = CommunityReviewCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/reviews', toApiJson(parsed))
  return CommunityReviewItemSchema.parse(fromApiJson(data))
}

export async function listReviews(input: unknown) {
  const parsed = CommunityReviewListInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    resource_id: parsed.resourceId,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/reviews${query}`)
  return CommunityReviewListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityReviewItemSchema.parse(item)),
  })
}

export async function patchReview(input: unknown) {
  const parsed = CommunityReviewPatchInputSchema.parse(input)
  const { id, ...patch } = parsed
  const client = requireClient()
  const data = await client.patch<unknown>(`/api/v1/reviews/${id}`, toApiJson(patch as Record<string, unknown>))
  return CommunityReviewItemSchema.parse(fromApiJson(data))
}

export async function deleteReview(input: unknown) {
  const parsed = CommunityReviewDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/reviews/${parsed.id}`)
  return CommunityReviewDeleteOutputSchema.parse({ deleted: true })
}

export async function listNewsSources() {
  const client = requireClient()
  const data = await client.get<unknown[]>('/api/v1/news/sources', { authenticated: false })
  return CommunityNewsSourceListOutputSchema.parse({ items: asItems(data) })
}

export async function createNewsSource(input: unknown) {
  const parsed = CommunityNewsSourceCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/news/sources', toApiJson(parsed))
  return CommunityNewsSourceSchema.parse(fromApiJson(data))
}

export async function deleteNewsSource(input: unknown) {
  const parsed = CommunityNewsSourceDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/news/sources/${parsed.sourceId}`)
  return { deleted: true as const }
}

export async function fetchNewsSource(input: unknown) {
  const parsed = CommunityNewsSourceFetchInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/news/sources/${parsed.sourceId}/fetch`)
  return fromApiJson(data)
}

export async function listNewsArticles(input: unknown) {
  const parsed = CommunityNewsListInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    category: parsed.category,
    source_id: parsed.sourceId,
    q: parsed.q,
    sort: parsed.sort,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/news/articles${query}`)
  return CommunityNewsListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityNewsArticleSchema.parse(fromApiJson(item))),
  })
}

export async function getNewsArticle(input: unknown) {
  const parsed = CommunityNewsGetInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown>(`/api/v1/news/articles/${parsed.id}`)
  return CommunityNewsArticleSchema.parse(fromApiJson(data))
}

export async function listRecommendedNews() {
  const client = requireClient()
  const data = await client.get<unknown[]>('/api/v1/news/articles/recommended')
  return CommunityNewsRecommendedOutputSchema.parse({
    items: asItems(data).map((item) => CommunityNewsArticleSchema.parse(fromApiJson(item))),
  })
}

export async function favoriteNewsArticle(input: unknown) {
  const parsed = CommunityNewsInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/news/articles/${parsed.articleId}/favorite`)
  return CommunityNewsInteractionOutputSchema.parse(fromApiJson(data))
}

export async function likeNewsArticle(input: unknown) {
  const parsed = CommunityNewsInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/news/articles/${parsed.articleId}/like`)
  return CommunityNewsInteractionOutputSchema.parse(fromApiJson(data))
}

export async function dislikeNewsArticle(input: unknown) {
  const parsed = CommunityNewsInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/news/articles/${parsed.articleId}/dislike`)
  return CommunityNewsInteractionOutputSchema.parse(fromApiJson(data))
}

export async function listNewsComments(input: unknown) {
  const parsed = CommunityNewsCommentListInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(
    `/api/v1/news/articles/${parsed.articleId}/comments${query}`,
    { authenticated: false },
  )
  return CommunityNewsCommentListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityNewsCommentSchema.parse(fromApiJson(item))),
  })
}

export async function createNewsComment(input: unknown) {
  const parsed = CommunityNewsCommentCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/news/articles/${parsed.articleId}/comments`,
    toApiJson({
      body: parsed.body,
      parentId: parsed.parentId ?? null,
    }),
  )
  return CommunityNewsCommentSchema.parse(fromApiJson(data))
}

export async function listComments(input: unknown) {
  const parsed = CommunityCommentListInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    target_type: parsed.targetType,
    target_id: parsed.targetId,
    parent_id: parsed.parentId ?? undefined,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/comments${query}`)
  return CommunityCommentListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityCommentSchema.parse(fromApiJson(item))),
  })
}

export async function createComment(input: unknown) {
  const parsed = CommunityCommentCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    '/api/v1/comments',
    toApiJson({
      targetType: parsed.targetType,
      targetId: parsed.targetId,
      body: parsed.body,
      parentId: parsed.parentId ?? null,
    }),
  )
  return CommunityCommentSchema.parse(fromApiJson(data))
}

export async function deleteComment(input: unknown) {
  const parsed = CommunityCommentDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/comments/${parsed.commentId}`)
  return { deleted: true as const }
}

export async function countComments(input: unknown) {
  const parsed = CommunityCommentCountInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    target_type: parsed.targetType,
    target_id: parsed.targetId,
    parent_id: parsed.parentId ?? undefined,
  })
  const data = await client.get<unknown>(`/api/v1/comments/count${query}`)
  return CommunityCommentCountOutputSchema.parse(fromApiJson(data))
}

export async function listBoardMessages(input: unknown) {
  const parsed = CommunityBoardMessageListInputSchema.parse(input ?? {})
  const query = buildApiQuery({
    user_id: parsed.userId,
    parent_id: parsed.parentId ?? undefined,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const cacheKey = `board-messages${query}`
  const data = await fetchWithHubCache(cacheKey, (client) =>
    client.get<unknown[]>(`/api/v1/board/messages${query}`),
  )
  return CommunityBoardMessageListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityBoardMessageSchema.parse(fromApiJson(item))),
  })
}

export async function favoriteBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageFavoriteInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/board/messages/${parsed.messageId}/favorite`)
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}

export async function createBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    '/api/v1/board/messages',
    toApiJson({
      body: parsed.body,
      parentId: parsed.parentId ?? null,
    }),
  )
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}

export async function likeBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageLikeInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/board/messages/${parsed.messageId}/like`)
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}

export async function dislikeBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageDislikeInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/board/messages/${parsed.messageId}/dislike`)
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}

export async function deleteBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/board/messages/${parsed.messageId}`)
  return CommunityBoardMessageDeleteOutputSchema.parse({ deleted: true })
}

export async function listTasks(input: unknown) {
  const parsed = CommunityTaskListInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    task_type: parsed.taskType,
    status: parsed.status,
    q: parsed.q,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/tasks${query}`)
  return CommunityTaskListOutputSchema.parse({
    items: asItems(data).map((item) => parseTaskItem(item)),
  })
}

export async function getTask(input: unknown) {
  const parsed = CommunityTaskGetInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown>(`/api/v1/tasks/${parsed.id}`)
  return parseTaskItem(data)
}

export async function createTask(input: unknown) {
  const parsed = CommunityTaskCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/tasks', toApiJson(parsed))
  return parseTaskItem(data)
}

export async function patchTask(input: unknown) {
  const parsed = CommunityTaskPatchInputSchema.parse(input)
  const { id, ...patch } = parsed
  const client = requireClient()
  const data = await client.patch<unknown>(`/api/v1/tasks/${id}`, toApiJson(patch as Record<string, unknown>))
  return parseTaskItem(data)
}

export async function publishTask(input: unknown) {
  const parsed = CommunityTaskIdInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/tasks/${parsed.id}/publish`)
  return parseTaskItem(data)
}

export async function cancelTask(input: unknown) {
  const parsed = CommunityTaskIdInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/tasks/${parsed.id}/cancel`)
  return parseTaskItem(data)
}

export async function applyTask(input: unknown) {
  const parsed = CommunityTaskApplyInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/tasks/${parsed.taskId}/apply`,
    toApiJson({ proposal: parsed.proposal, quotedAmount: parsed.quotedAmount }),
  )
  return fromApiJson(data)
}

export async function listTaskApplications(input: unknown) {
  const parsed = CommunityTaskApplicationsListInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown[]>(`/api/v1/tasks/${parsed.taskId}/applications`)
  return CommunityTaskApplicationsListOutputSchema.parse({ items: asItems(data) })
}

export async function acceptTaskApplication(input: unknown) {
  const parsed = CommunityTaskApplicationAcceptInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/tasks/${parsed.taskId}/applications/${parsed.applicationId}/accept`,
  )
  return parseTaskItem(data)
}

export async function deliverTask(input: unknown) {
  const parsed = CommunityTaskDeliverInputSchema.parse(input)
  const client = requireClient()
  const packageBytes = await readFile(parsed.packagePath)
  const data = await client.postMultipart<unknown>(`/api/v1/tasks/${parsed.taskId}/deliver`, [
    ...(parsed.notes ? [{ name: 'notes', value: parsed.notes }] : []),
    {
      name: 'package',
      value: packageBytes,
      filename: parsed.originalFilename ?? basename(parsed.packagePath),
    },
  ])
  return CommunityTaskDeliverySchema.parse(fromApiJson(data))
}

export async function acceptTaskDelivery(input: unknown) {
  const parsed = CommunityTaskIdInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/tasks/${parsed.id}/accept-delivery`)
  return parseTaskItem(data)
}

export async function rejectTaskDelivery(input: unknown) {
  const parsed = CommunityTaskRejectDeliveryInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/tasks/${parsed.taskId}/reject-delivery`,
    toApiJson({ reason: parsed.reason }),
  )
  return parseTaskItem(data)
}

export async function createTaskReview(input: unknown) {
  const parsed = CommunityTaskReviewCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/tasks/${parsed.taskId}/reviews`,
    toApiJson({
      rating: parsed.rating,
      body: parsed.body,
      revieweeId: parsed.revieweeId,
    }),
  )
  return fromApiJson(data)
}

export async function listTaskReviews(input: unknown) {
  const parsed = CommunityTaskReviewListInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown[]>(`/api/v1/tasks/${parsed.taskId}/reviews`)
  return CommunityTaskReviewListOutputSchema.parse({ items: asItems(data) })
}

export async function createOrder(input: unknown) {
  const parsed = CommunityOrderCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/orders', toApiJson(parsed))
  return CommunityOrderItemSchema.parse(fromApiJson(data))
}

export async function getOrder(input: unknown) {
  const parsed = CommunityOrderGetInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown>(`/api/v1/orders/${parsed.id}`)
  return CommunityOrderItemSchema.parse(fromApiJson(data))
}

export async function updateOrderStatus(input: unknown) {
  const parsed = CommunityOrderUpdateStatusInputSchema.parse(input)
  const client = requireClient()
  const data = await client.patch<unknown>(
    `/api/v1/orders/${parsed.id}/status`,
    toApiJson({ status: parsed.status }),
  )
  return CommunityOrderItemSchema.parse(fromApiJson(data))
}

export async function createModerationReport(input: unknown) {
  const parsed = CommunityModerationReportCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/moderation/reports', toApiJson(parsed))
  return CommunityModerationReportSchema.parse(fromApiJson(data))
}

export async function listModerationReports(input: unknown) {
  const parsed = CommunityModerationReportListInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    status: parsed.status,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/moderation/reports${query}`)
  return CommunityModerationReportListOutputSchema.parse({ items: asItems(data) })
}

export async function resolveModerationReport(input: unknown) {
  const parsed = CommunityModerationReportResolveInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/moderation/reports/${parsed.reportId}/resolve`,
    toApiJson({ action: parsed.action, note: parsed.note }),
  )
  return CommunityModerationReportSchema.parse(fromApiJson(data))
}

export async function suspendModerationResource(input: unknown) {
  const parsed = CommunityModerationResourceActionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/moderation/resources/${parsed.resourceId}/suspend`,
    toApiJson({ reason: parsed.reason }),
  )
  return CommunityModerationResourceActionOutputSchema.parse(fromApiJson(data))
}

export async function approveModerationResource(input: unknown) {
  const parsed = CommunityModerationResourceActionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/moderation/resources/${parsed.resourceId}/approve`,
    toApiJson({ note: parsed.note }),
  )
  return CommunityModerationResourceActionOutputSchema.parse(fromApiJson(data))
}

export async function banModerationUser(input: unknown) {
  const parsed = CommunityModerationUserBanInputSchema.parse(input)
  const client = requireClient()
  await client.post<unknown>(
    `/api/v1/moderation/users/${parsed.userId}/ban`,
    toApiJson({
      durationHours: parsed.durationHours,
      reason: parsed.reason,
    }),
  )
  return { banned: true }
}

export async function unbanModerationUser(input: unknown) {
  const parsed = CommunityModerationUserUnbanInputSchema.parse(input)
  const client = requireClient()
  await client.post<unknown>(`/api/v1/moderation/users/${parsed.userId}/unban`, {})
  return { unbanned: true }
}

export async function banModerationDevice(input: unknown) {
  const parsed = CommunityModerationDeviceBanInputSchema.parse(input)
  const client = requireClient()
  await client.post<unknown>(
    `/api/v1/moderation/devices/${encodeURIComponent(parsed.deviceId)}/ban`,
    toApiJson({
      userId: parsed.userId,
      deviceName: parsed.deviceName,
      durationHours: parsed.durationHours,
      reason: parsed.reason,
    }),
  )
  return { banned: true }
}

export async function unbanModerationDevice(input: unknown) {
  const parsed = CommunityModerationDeviceUnbanInputSchema.parse(input)
  const client = requireClient()
  await client.post<unknown>(
    `/api/v1/moderation/devices/${encodeURIComponent(parsed.deviceId)}/unban`,
    {},
  )
  return { unbanned: true }
}

export async function listModerationLogs(input: unknown) {
  const parsed = CommunityModerationLogsListInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/moderation/logs${query}`)
  return CommunityModerationLogsListOutputSchema.parse({ items: asItems(data) })
}

export async function scanModerationOnline() {
  const client = requireClient()
  const data = await client.get<unknown>('/api/v1/moderation/scan')
  return CommunityModerationScanOutputSchema.parse(fromApiJson(data))
}

export async function touchCommunityPresenceHeartbeat() {
  const { touchCommunityPresence } = await import('./community-presence.service')
  await touchCommunityPresence()
  return { ok: true }
}

export async function listCommunityAdmins() {
  const client = requireClient()
  const data = await client.get<unknown[]>('/api/v1/users/moderators')
  return CommunityModeratorListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityModeratorUserSchema.parse(fromApiJson(item))),
  })
}

export async function searchCommunityUsers(input: unknown) {
  const parsed = CommunityUserSearchInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    q: parsed.q,
    limit: parsed.limit,
  })
  const data = await client.get<unknown[]>(`/api/v1/users/search${query}`)
  return CommunityModeratorListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityModeratorUserSchema.parse(fromApiJson(item))),
  })
}

export async function appointCommunityAdmin(input: unknown) {
  const parsed = CommunityAdminAppointInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/users/${parsed.userId}/appoint-admin`)
  return CommunityModeratorUserSchema.parse(fromApiJson(data))
}

export async function revokeCommunityAdmin(input: unknown) {
  const parsed = CommunityAdminRevokeInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/users/${parsed.userId}/revoke-admin`)
  return CommunityModeratorUserSchema.parse(fromApiJson(data))
}
