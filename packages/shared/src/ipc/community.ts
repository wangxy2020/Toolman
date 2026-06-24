import { z } from 'zod'
import { CommunityHubModeSchema } from '../community/hub-config.js'
import { TimestampSchema, UuidSchema } from './base.js'

// --- Shared enums ---

export const CommunityResourceTypeSchema = z.enum(['mcp', 'skill', 'workflow', 'task', 'knowledge'])
export type CommunityResourceType = z.infer<typeof CommunityResourceTypeSchema>

export const CommunityResourceVisibilitySchema = z.enum(['public', 'unlisted', 'private'])
export type CommunityResourceVisibility = z.infer<typeof CommunityResourceVisibilitySchema>

export const CommunityResourceStatusSchema = z.enum([
  'draft',
  'pending_review',
  'published',
  'suspended',
  'archived',
])
export type CommunityResourceStatus = z.infer<typeof CommunityResourceStatusSchema>

export const CommunityUserRoleSchema = z.enum(['guest', 'user', 'enterprise', 'admin', 'founder'])
export type CommunityUserRole = z.infer<typeof CommunityUserRoleSchema>

export const CommunityTaskTypeSchema = z.enum([
  'development',
  'design',
  'translation',
  'tender',
  'other',
])
export type CommunityTaskType = z.infer<typeof CommunityTaskTypeSchema>

export const CommunityTaskStatusSchema = z.enum([
  'draft',
  'open',
  'assigned',
  'in_progress',
  'delivered',
  'completed',
  'cancelled',
  'disputed',
])
export type CommunityTaskStatus = z.infer<typeof CommunityTaskStatusSchema>

export const CommunityInstallStatusSchema = z.enum([
  'pending',
  'success',
  'failed',
  'rolled_back',
])
export type CommunityInstallStatus = z.infer<typeof CommunityInstallStatusSchema>

export const CommunityOrderStatusSchema = z.enum([
  'pending',
  'escrow',
  'paid',
  'refunded',
  'cancelled',
])
export type CommunityOrderStatus = z.infer<typeof CommunityOrderStatusSchema>

export const CommunityReportTargetTypeSchema = z.enum([
  'resource',
  'news',
  'comment',
  'user',
  'task',
])
export type CommunityReportTargetType = z.infer<typeof CommunityReportTargetTypeSchema>

export const CommunityReportReasonSchema = z.enum(['spam', 'illegal', 'copyright', 'other'])
export type CommunityReportReason = z.infer<typeof CommunityReportReasonSchema>

export const CommunityReportStatusSchema = z.enum(['open', 'reviewing', 'resolved', 'dismissed'])
export type CommunityReportStatus = z.infer<typeof CommunityReportStatusSchema>

export const CommunityMarketplaceSortSchema = z.enum([
  'newest',
  'rating',
  'downloads',
  'installs',
])
export type CommunityMarketplaceSort = z.infer<typeof CommunityMarketplaceSortSchema>

export const CommunityNewsSortSchema = z.enum(['newest', 'popular', 'diverse'])
export type CommunityNewsSort = z.infer<typeof CommunityNewsSortSchema>

export const CommunityApiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
])
export type CommunityApiErrorCode = z.infer<typeof CommunityApiErrorCodeSchema>

export const CommunityApiErrorSchema = z.object({
  code: CommunityApiErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean().default(false),
})
export type CommunityApiError = z.infer<typeof CommunityApiErrorSchema>

export const CommunityAuthorSummarySchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
})
export type CommunityAuthorSummary = z.infer<typeof CommunityAuthorSummarySchema>

export const CommunityPublisherSummarySchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
})
export type CommunityPublisherSummary = z.infer<typeof CommunityPublisherSummarySchema>

// --- Hub ---

export const CommunityHubHealthOutputSchema = z.object({
  status: z.string(),
  version: z.string(),
  db: z.string(),
  dataDir: z.string().optional(),
  requireReview: z.boolean().optional(),
  userCount: z.number().int().nonnegative().optional(),
  resourceCount: z.number().int().nonnegative().optional(),
})
export type CommunityHubHealthOutput = z.infer<typeof CommunityHubHealthOutputSchema>

export const CommunityHubStatusOutputSchema = z.object({
  running: z.boolean(),
  mode: CommunityHubModeSchema.default('local'),
  port: z.number().int().positive().nullable(),
  host: z.string(),
  baseUrl: z.string().nullable(),
  binaryPath: z.string().nullable(),
  offlineReadOnly: z.boolean().default(false),
  error: z.string().optional(),
})
export type CommunityHubStatusOutput = z.infer<typeof CommunityHubStatusOutputSchema>

// --- User ---

export const CommunityUserProfileSchema = z.object({
  id: UuidSchema,
  identityId: UuidSchema,
  displayName: z.string(),
  avatarPath: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  role: CommunityUserRoleSchema,
  canPublish: z.boolean(),
  canAcceptTask: z.boolean(),
  canCreateResource: z.boolean(),
  isBanned: z.boolean(),
  bannedUntil: TimestampSchema.nullable().optional(),
  enterpriseName: z.string().nullable().optional(),
  statsJson: z.record(z.unknown()).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type CommunityUserProfile = z.infer<typeof CommunityUserProfileSchema>

export const CommunityUserMeUpdateInputSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarPath: z.string().nullable().optional(),
})
export type CommunityUserMeUpdateInput = z.infer<typeof CommunityUserMeUpdateInputSchema>

// --- Marketplace ---

export const CommunityResourceListInputSchema = z.object({
  resourceType: CommunityResourceTypeSchema.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  q: z.string().optional(),
  sort: CommunityMarketplaceSortSchema.optional(),
  visibility: CommunityResourceVisibilitySchema.optional(),
  status: CommunityResourceStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityResourceListInput = z.infer<typeof CommunityResourceListInputSchema>

export const CommunityResourceItemSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  description: z.string(),
  author: CommunityAuthorSummarySchema,
  version: z.string(),
  tags: z.array(z.string()),
  category: z.string(),
  rating: z.number(),
  ratingCount: z.number().int().nonnegative(),
  downloadCount: z.number().int().nonnegative(),
  installCount: z.number().int().nonnegative(),
  favoriteCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative().default(0),
  dislikeCount: z.number().int().nonnegative().default(0),
  commentCount: z.number().int().nonnegative().default(0),
  resourceType: CommunityResourceTypeSchema,
  coverUrl: z.string().nullable().optional(),
  license: z.string(),
  visibility: CommunityResourceVisibilitySchema,
  status: CommunityResourceStatusSchema,
  resourceSize: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  likedByMe: z.boolean().optional(),
  favoritedByMe: z.boolean().optional(),
  dislikedByMe: z.boolean().optional(),
})
export type CommunityResourceItem = z.infer<typeof CommunityResourceItemSchema>

export const CommunityResourceListOutputSchema = z.object({
  items: z.array(CommunityResourceItemSchema),
})
export type CommunityResourceListOutput = z.infer<typeof CommunityResourceListOutputSchema>

export const CommunityResourceGetInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityResourceGetInput = z.infer<typeof CommunityResourceGetInputSchema>

export const CommunityResourceDetailSchema = CommunityResourceItemSchema.extend({
  manifestJson: z.record(z.unknown()).optional(),
  packagePath: z.string().nullable().optional(),
  publishedAt: TimestampSchema.nullable().optional(),
})
export type CommunityResourceDetail = z.infer<typeof CommunityResourceDetailSchema>

export const CommunityResourceCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  resourceType: CommunityResourceTypeSchema,
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  license: z.string().optional(),
  visibility: CommunityResourceVisibilitySchema.optional(),
})
export type CommunityResourceCreateInput = z.infer<typeof CommunityResourceCreateInputSchema>

export const CommunityResourcePublishInputSchema = z.object({
  id: UuidSchema,
  version: z.string().min(1).max(64),
  changelog: z.string().max(2000).optional(),
  /** Absolute path to package file readable by Main process */
  packagePath: z.string().min(1),
  originalFilename: z.string().optional(),
})
export type CommunityResourcePublishInput = z.infer<typeof CommunityResourcePublishInputSchema>

export const CommunityResourceInteractionInputSchema = z.object({
  resourceId: UuidSchema,
})
export type CommunityResourceInteractionInput = z.infer<typeof CommunityResourceInteractionInputSchema>

export const CommunityResourceInteractionOutputSchema = z.object({
  resourceId: UuidSchema,
  likeCount: z.number().int().nonnegative(),
  dislikeCount: z.number().int().nonnegative(),
  favoriteCount: z.number().int().nonnegative(),
  liked: z.boolean().optional(),
  favorited: z.boolean().optional(),
  disliked: z.boolean().optional(),
})
export type CommunityResourceInteractionOutput = z.infer<
  typeof CommunityResourceInteractionOutputSchema
>

export const CommunityResourcePatchInputSchema = z.object({
  id: UuidSchema,
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  license: z.string().optional(),
  visibility: CommunityResourceVisibilitySchema.optional(),
})
export type CommunityResourcePatchInput = z.infer<typeof CommunityResourcePatchInputSchema>

export const CommunityResourceDeleteInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityResourceDeleteInput = z.infer<typeof CommunityResourceDeleteInputSchema>

export const CommunityResourceDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})
export type CommunityResourceDeleteOutput = z.infer<typeof CommunityResourceDeleteOutputSchema>

// --- Install ---

export const CommunityInstallInputSchema = z.object({
  resourceType: CommunityResourceTypeSchema,
  resourceId: UuidSchema,
  version: z.string().optional(),
  workspaceId: UuidSchema.optional(),
  options: z.record(z.unknown()).optional(),
})
export type CommunityInstallInput = z.infer<typeof CommunityInstallInputSchema>

export const CommunityInstallOutputSchema = z.object({
  installId: UuidSchema,
  packagePath: z.string(),
  manifest: z.record(z.unknown()),
  adapter: z.enum(['mcp', 'skill', 'workflow', 'task']),
  instructions: z.string(),
})
export type CommunityInstallOutput = z.infer<typeof CommunityInstallOutputSchema>

export const CommunityInstallCompleteInputSchema = z.object({
  installId: UuidSchema,
  status: z.enum(['success', 'failed']),
  localRef: z.string().optional(),
  errorMessage: z.string().optional(),
})
export type CommunityInstallCompleteInput = z.infer<typeof CommunityInstallCompleteInputSchema>

export const CommunityInstallItemSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  resourceId: UuidSchema,
  versionId: UuidSchema,
  workspaceId: UuidSchema.nullable().optional(),
  localRef: z.string().nullable().optional(),
  installStatus: CommunityInstallStatusSchema,
  errorMessage: z.string().nullable().optional(),
  installedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable().optional(),
})
export type CommunityInstallItem = z.infer<typeof CommunityInstallItemSchema>

export const CommunityInstallCompleteOutputSchema = CommunityInstallItemSchema
export type CommunityInstallCompleteOutput = z.infer<typeof CommunityInstallCompleteOutputSchema>

export const CommunityInstallRollbackInputSchema = z.object({
  installId: UuidSchema,
})
export type CommunityInstallRollbackInput = z.infer<typeof CommunityInstallRollbackInputSchema>

export const CommunityInstallHistoryInputSchema = z.object({
  resourceType: CommunityResourceTypeSchema.optional(),
  workspaceId: UuidSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityInstallHistoryInput = z.infer<typeof CommunityInstallHistoryInputSchema>

export const CommunityInstallHistoryOutputSchema = z.object({
  items: z.array(CommunityInstallItemSchema),
})
export type CommunityInstallHistoryOutput = z.infer<typeof CommunityInstallHistoryOutputSchema>

// --- Reviews ---

export const CommunityReviewCreateInputSchema = z.object({
  resourceId: UuidSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
})
export type CommunityReviewCreateInput = z.infer<typeof CommunityReviewCreateInputSchema>

export const CommunityReviewAuthorSchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
})
export type CommunityReviewAuthor = z.infer<typeof CommunityReviewAuthorSchema>

export const CommunityReviewItemSchema = z.object({
  id: UuidSchema,
  resourceId: UuidSchema,
  userId: UuidSchema,
  author: CommunityReviewAuthorSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().nullable().optional(),
  body: z.string(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type CommunityReviewItem = z.infer<typeof CommunityReviewItemSchema>

export const CommunityReviewListInputSchema = z.object({
  resourceId: UuidSchema,
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityReviewListInput = z.infer<typeof CommunityReviewListInputSchema>

export const CommunityReviewListOutputSchema = z.object({
  items: z.array(CommunityReviewItemSchema),
})
export type CommunityReviewListOutput = z.infer<typeof CommunityReviewListOutputSchema>

export const CommunityReviewPatchInputSchema = z.object({
  id: UuidSchema,
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(200).nullable().optional(),
  body: z.string().max(5000).optional(),
})
export type CommunityReviewPatchInput = z.infer<typeof CommunityReviewPatchInputSchema>

export const CommunityReviewDeleteInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityReviewDeleteInput = z.infer<typeof CommunityReviewDeleteInputSchema>

export const CommunityReviewDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})
export type CommunityReviewDeleteOutput = z.infer<typeof CommunityReviewDeleteOutputSchema>

// --- News ---

export const CommunityNewsSourceIdSchema = z.string().min(1).max(128)

export const CommunityNewsSourceSchema = z.object({
  id: CommunityNewsSourceIdSchema,
  title: z.string(),
  feedUrl: z.string().url(),
  siteUrl: z.string(),
  category: z.string(),
  language: z.string(),
  enabled: z.boolean(),
  fetchIntervalMinutes: z.number().int().positive(),
  lastFetchedAt: TimestampSchema.nullable().optional(),
  lastError: z.string().nullable().optional(),
  createdAt: TimestampSchema,
})
export type CommunityNewsSource = z.infer<typeof CommunityNewsSourceSchema>

export const CommunityNewsSourceListOutputSchema = z.object({
  items: z.array(CommunityNewsSourceSchema),
})
export type CommunityNewsSourceListOutput = z.infer<typeof CommunityNewsSourceListOutputSchema>

export const CommunityNewsSourceFetchInputSchema = z.object({
  sourceId: CommunityNewsSourceIdSchema,
})
export type CommunityNewsSourceFetchInput = z.infer<typeof CommunityNewsSourceFetchInputSchema>

export const CommunityNewsSourceCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  feedUrl: z.string().url(),
  siteUrl: z.string().url().optional(),
  category: z.string().max(64).optional(),
  language: z.string().max(16).optional(),
  fetchIntervalMinutes: z.number().int().min(5).max(1440).optional(),
})
export type CommunityNewsSourceCreateInput = z.infer<typeof CommunityNewsSourceCreateInputSchema>

export const CommunityNewsSourceDeleteInputSchema = z.object({
  sourceId: CommunityNewsSourceIdSchema,
})
export type CommunityNewsSourceDeleteInput = z.infer<typeof CommunityNewsSourceDeleteInputSchema>

export const CommunityNewsArticleSchema = z.object({
  id: UuidSchema,
  sourceId: CommunityNewsSourceIdSchema,
  sourceTitle: z.string(),
  guid: z.string(),
  title: z.string(),
  summary: z.string(),
  contentHtml: z.string().nullable().optional(),
  link: z.string(),
  author: z.string().nullable().optional(),
  tags: z.array(z.string()),
  coverUrl: z.string().nullable().optional(),
  publishedAt: TimestampSchema,
  fetchedAt: TimestampSchema,
  likeCount: z.number().int().nonnegative(),
  favoriteCount: z.number().int().nonnegative(),
  dislikeCount: z.number().int().nonnegative().default(0),
  viewCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative().default(0),
  likedByMe: z.boolean().optional(),
  favoritedByMe: z.boolean().optional(),
  dislikedByMe: z.boolean().optional(),
})
export type CommunityNewsArticle = z.infer<typeof CommunityNewsArticleSchema>

export const CommunityNewsListInputSchema = z.object({
  category: z.string().optional(),
  sourceId: CommunityNewsSourceIdSchema.optional(),
  q: z.string().optional(),
  sort: CommunityNewsSortSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityNewsListInput = z.infer<typeof CommunityNewsListInputSchema>

export const CommunityNewsListOutputSchema = z.object({
  items: z.array(CommunityNewsArticleSchema),
})
export type CommunityNewsListOutput = z.infer<typeof CommunityNewsListOutputSchema>

export const CommunityNewsGetInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityNewsGetInput = z.infer<typeof CommunityNewsGetInputSchema>

export const CommunityNewsRecommendedOutputSchema = z.object({
  items: z.array(CommunityNewsArticleSchema),
})
export type CommunityNewsRecommendedOutput = z.infer<typeof CommunityNewsRecommendedOutputSchema>

export const CommunityNewsInteractionInputSchema = z.object({
  articleId: UuidSchema,
})
export type CommunityNewsInteractionInput = z.infer<typeof CommunityNewsInteractionInputSchema>

export const CommunityNewsInteractionOutputSchema = z.object({
  articleId: UuidSchema,
  likeCount: z.number().int().nonnegative().optional(),
  favoriteCount: z.number().int().nonnegative().optional(),
  dislikeCount: z.number().int().nonnegative().optional(),
  liked: z.boolean().optional(),
  favorited: z.boolean().optional(),
  disliked: z.boolean().optional(),
})
export type CommunityNewsInteractionOutput = z.infer<typeof CommunityNewsInteractionOutputSchema>

export const CommunityNewsCommentSchema = z.object({
  id: UuidSchema,
  articleId: UuidSchema,
  userId: UuidSchema,
  author: CommunityAuthorSummarySchema,
  parentId: UuidSchema.nullable().optional(),
  body: z.string(),
  likeCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type CommunityNewsComment = z.infer<typeof CommunityNewsCommentSchema>

export const CommunityNewsCommentListInputSchema = z.object({
  articleId: UuidSchema,
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityNewsCommentListInput = z.infer<typeof CommunityNewsCommentListInputSchema>

export const CommunityNewsCommentListOutputSchema = z.object({
  items: z.array(CommunityNewsCommentSchema),
})
export type CommunityNewsCommentListOutput = z.infer<typeof CommunityNewsCommentListOutputSchema>

export const CommunityNewsCommentCreateInputSchema = z.object({
  articleId: UuidSchema,
  body: z.string().min(1).max(5000),
  parentId: UuidSchema.nullable().optional(),
})
export type CommunityNewsCommentCreateInput = z.infer<typeof CommunityNewsCommentCreateInputSchema>

// --- Generic comments ---

export const CommunityBoardMainIdSchema = z.literal('main')
export const CommunityCommentTargetIdSchema = z.union([UuidSchema, CommunityBoardMainIdSchema])

export const CommunityCommentTargetTypeSchema = z.enum(['news', 'resource', 'board', 'task'])
export type CommunityCommentTargetType = z.infer<typeof CommunityCommentTargetTypeSchema>

export const CommunityCommentSchema = z.object({
  id: UuidSchema,
  targetType: CommunityCommentTargetTypeSchema,
  targetId: CommunityCommentTargetIdSchema,
  parentId: UuidSchema.nullable().optional(),
  userId: UuidSchema,
  author: CommunityAuthorSummarySchema,
  body: z.string(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type CommunityComment = z.infer<typeof CommunityCommentSchema>

export const CommunityCommentListInputSchema = z.object({
  targetType: CommunityCommentTargetTypeSchema,
  targetId: CommunityCommentTargetIdSchema,
  parentId: UuidSchema.nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityCommentListInput = z.infer<typeof CommunityCommentListInputSchema>

export const CommunityCommentListOutputSchema = z.object({
  items: z.array(CommunityCommentSchema),
})
export type CommunityCommentListOutput = z.infer<typeof CommunityCommentListOutputSchema>

export const CommunityCommentCreateInputSchema = z.object({
  targetType: CommunityCommentTargetTypeSchema,
  targetId: CommunityCommentTargetIdSchema,
  body: z.string().min(1).max(5000),
  parentId: UuidSchema.nullable().optional(),
})
export type CommunityCommentCreateInput = z.infer<typeof CommunityCommentCreateInputSchema>

export const CommunityCommentDeleteInputSchema = z.object({
  commentId: UuidSchema,
})
export type CommunityCommentDeleteInput = z.infer<typeof CommunityCommentDeleteInputSchema>

export const CommunityCommentCountInputSchema = z.object({
  targetType: CommunityCommentTargetTypeSchema,
  targetId: CommunityCommentTargetIdSchema,
  parentId: UuidSchema.nullable().optional(),
})
export type CommunityCommentCountInput = z.infer<typeof CommunityCommentCountInputSchema>

export const CommunityCommentCountOutputSchema = z.object({
  targetType: CommunityCommentTargetTypeSchema,
  targetId: CommunityCommentTargetIdSchema,
  count: z.number().int().nonnegative(),
})
export type CommunityCommentCountOutput = z.infer<typeof CommunityCommentCountOutputSchema>

// --- Message board ---

export const CommunityBoardMessageSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  author: CommunityAuthorSummarySchema,
  parentId: UuidSchema.nullable().optional(),
  body: z.string(),
  likeCount: z.number().int().nonnegative(),
  dislikeCount: z.number().int().nonnegative().default(0),
  favoriteCount: z.number().int().nonnegative().default(0),
  replyCount: z.number().int().nonnegative(),
  likedByMe: z.boolean().optional(),
  dislikedByMe: z.boolean().optional(),
  favoritedByMe: z.boolean().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type CommunityBoardMessage = z.infer<typeof CommunityBoardMessageSchema>

export const CommunityBoardMessageListInputSchema = z.object({
  userId: UuidSchema.optional(),
  parentId: UuidSchema.nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityBoardMessageListInput = z.infer<typeof CommunityBoardMessageListInputSchema>

export const CommunityBoardMessageListOutputSchema = z.object({
  items: z.array(CommunityBoardMessageSchema),
})
export type CommunityBoardMessageListOutput = z.infer<typeof CommunityBoardMessageListOutputSchema>

export const CommunityBoardMessageCreateInputSchema = z.object({
  body: z.string().min(1).max(5000),
  parentId: UuidSchema.nullable().optional(),
})
export type CommunityBoardMessageCreateInput = z.infer<typeof CommunityBoardMessageCreateInputSchema>

export const CommunityBoardMessageLikeInputSchema = z.object({
  messageId: UuidSchema,
})
export type CommunityBoardMessageLikeInput = z.infer<typeof CommunityBoardMessageLikeInputSchema>

export const CommunityBoardMessageDislikeInputSchema = z.object({
  messageId: UuidSchema,
})
export type CommunityBoardMessageDislikeInput = z.infer<
  typeof CommunityBoardMessageDislikeInputSchema
>

export const CommunityBoardMessageFavoriteInputSchema = z.object({
  messageId: UuidSchema,
})
export type CommunityBoardMessageFavoriteInput = z.infer<
  typeof CommunityBoardMessageFavoriteInputSchema
>

export const CommunityBoardMessageDeleteInputSchema = z.object({
  messageId: UuidSchema,
})
export type CommunityBoardMessageDeleteInput = z.infer<
  typeof CommunityBoardMessageDeleteInputSchema
>

export const CommunityBoardMessageDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})
export type CommunityBoardMessageDeleteOutput = z.infer<
  typeof CommunityBoardMessageDeleteOutputSchema
>

// --- Tasks ---

export const CommunityTaskItemSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  description: z.string(),
  publisher: CommunityPublisherSummarySchema,
  assigneeId: UuidSchema.nullable().optional(),
  resourceId: UuidSchema.nullable().optional(),
  taskType: CommunityTaskTypeSchema,
  budgetAmount: z.number(),
  budgetCurrency: z.string(),
  deadlineAt: TimestampSchema.nullable().optional(),
  status: CommunityTaskStatusSchema,
  tags: z.array(z.string()),
  attachmentsJson: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable().optional(),
})
export type CommunityTaskItem = z.infer<typeof CommunityTaskItemSchema>

export const CommunityTaskListInputSchema = z.object({
  taskType: CommunityTaskTypeSchema.optional(),
  status: CommunityTaskStatusSchema.optional(),
  q: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityTaskListInput = z.infer<typeof CommunityTaskListInputSchema>

export const CommunityTaskListOutputSchema = z.object({
  items: z.array(CommunityTaskItemSchema),
})
export type CommunityTaskListOutput = z.infer<typeof CommunityTaskListOutputSchema>

export const CommunityTaskGetInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityTaskGetInput = z.infer<typeof CommunityTaskGetInputSchema>

export const CommunityTaskCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  taskType: CommunityTaskTypeSchema,
  budgetAmount: z.number().nonnegative().optional(),
  budgetCurrency: z.string().optional(),
  deadlineAt: TimestampSchema.optional(),
  tags: z.array(z.string()).optional(),
  resourceId: UuidSchema.optional(),
})
export type CommunityTaskCreateInput = z.infer<typeof CommunityTaskCreateInputSchema>

export const CommunityTaskPatchInputSchema = z.object({
  id: UuidSchema,
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  taskType: CommunityTaskTypeSchema.optional(),
  budgetAmount: z.number().nonnegative().optional(),
  budgetCurrency: z.string().optional(),
  deadlineAt: TimestampSchema.nullable().optional(),
  tags: z.array(z.string()).optional(),
  resourceId: UuidSchema.nullable().optional(),
})
export type CommunityTaskPatchInput = z.infer<typeof CommunityTaskPatchInputSchema>

export const CommunityTaskIdInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityTaskIdInput = z.infer<typeof CommunityTaskIdInputSchema>

export const CommunityTaskApplyInputSchema = z.object({
  taskId: UuidSchema,
  proposal: z.string().min(1).max(5000),
  quotedAmount: z.number().nonnegative(),
})
export type CommunityTaskApplyInput = z.infer<typeof CommunityTaskApplyInputSchema>

export const CommunityTaskApplicationSchema = z.object({
  id: UuidSchema,
  taskId: UuidSchema,
  applicantId: UuidSchema,
  proposal: z.string(),
  quotedAmount: z.number(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  createdAt: TimestampSchema,
})
export type CommunityTaskApplication = z.infer<typeof CommunityTaskApplicationSchema>

export const CommunityTaskApplicationsListInputSchema = z.object({
  taskId: UuidSchema,
})
export type CommunityTaskApplicationsListInput = z.infer<
  typeof CommunityTaskApplicationsListInputSchema
>

export const CommunityTaskApplicationsListOutputSchema = z.object({
  items: z.array(CommunityTaskApplicationSchema),
})
export type CommunityTaskApplicationsListOutput = z.infer<
  typeof CommunityTaskApplicationsListOutputSchema
>

export const CommunityTaskApplicationAcceptInputSchema = z.object({
  taskId: UuidSchema,
  applicationId: UuidSchema,
})
export type CommunityTaskApplicationAcceptInput = z.infer<
  typeof CommunityTaskApplicationAcceptInputSchema
>

export const CommunityTaskDeliverInputSchema = z.object({
  taskId: UuidSchema,
  /** Absolute path to delivery package file */
  packagePath: z.string().min(1),
  originalFilename: z.string().optional(),
  notes: z.string().optional(),
})
export type CommunityTaskDeliverInput = z.infer<typeof CommunityTaskDeliverInputSchema>

export const CommunityTaskDeliverySchema = z.object({
  id: UuidSchema,
  taskId: UuidSchema,
  submitterId: UuidSchema,
  packagePath: z.string(),
  notes: z.string().nullable().optional(),
  status: z.enum(['submitted', 'accepted', 'rejected']),
  createdAt: TimestampSchema,
})
export type CommunityTaskDelivery = z.infer<typeof CommunityTaskDeliverySchema>

export const CommunityTaskRejectDeliveryInputSchema = z.object({
  taskId: UuidSchema,
  reason: z.string().optional(),
})
export type CommunityTaskRejectDeliveryInput = z.infer<typeof CommunityTaskRejectDeliveryInputSchema>

export const CommunityTaskReviewCreateInputSchema = z.object({
  taskId: UuidSchema,
  rating: z.number().int().min(1).max(5),
  body: z.string().min(1).max(5000),
  revieweeId: UuidSchema,
})
export type CommunityTaskReviewCreateInput = z.infer<typeof CommunityTaskReviewCreateInputSchema>

export const CommunityTaskReviewAuthorSchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
})
export type CommunityTaskReviewAuthor = z.infer<typeof CommunityTaskReviewAuthorSchema>

export const CommunityTaskReviewItemSchema = z.object({
  id: UuidSchema,
  taskId: UuidSchema,
  reviewerId: UuidSchema,
  revieweeId: UuidSchema,
  reviewer: CommunityTaskReviewAuthorSchema,
  reviewee: CommunityTaskReviewAuthorSchema,
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type CommunityTaskReviewItem = z.infer<typeof CommunityTaskReviewItemSchema>

export const CommunityTaskReviewListInputSchema = z.object({
  taskId: UuidSchema,
})
export type CommunityTaskReviewListInput = z.infer<typeof CommunityTaskReviewListInputSchema>

export const CommunityTaskReviewListOutputSchema = z.object({
  items: z.array(CommunityTaskReviewItemSchema),
})
export type CommunityTaskReviewListOutput = z.infer<typeof CommunityTaskReviewListOutputSchema>

// --- Orders ---

export const CommunityOrderCreateInputSchema = z.object({
  taskId: UuidSchema,
  amount: z.number().positive(),
  currency: z.string().min(1).max(8),
})
export type CommunityOrderCreateInput = z.infer<typeof CommunityOrderCreateInputSchema>

export const CommunityOrderItemSchema = z.object({
  id: UuidSchema,
  taskId: UuidSchema,
  payerId: UuidSchema,
  payeeId: UuidSchema,
  amount: z.number(),
  currency: z.string(),
  status: CommunityOrderStatusSchema,
  paymentProvider: z.string().nullable().optional(),
  externalOrderId: z.string().nullable().optional(),
  createdAt: TimestampSchema,
  paidAt: TimestampSchema.nullable().optional(),
})
export type CommunityOrderItem = z.infer<typeof CommunityOrderItemSchema>

export const CommunityOrderGetInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityOrderGetInput = z.infer<typeof CommunityOrderGetInputSchema>

export const CommunityOrderUpdateStatusInputSchema = z.object({
  id: UuidSchema,
  status: CommunityOrderStatusSchema,
})
export type CommunityOrderUpdateStatusInput = z.infer<typeof CommunityOrderUpdateStatusInputSchema>

// --- Moderation ---

export const CommunityModerationReportCreateInputSchema = z.object({
  targetType: CommunityReportTargetTypeSchema,
  targetId: UuidSchema,
  reason: CommunityReportReasonSchema,
  description: z.string().max(5000).optional(),
})
export type CommunityModerationReportCreateInput = z.infer<
  typeof CommunityModerationReportCreateInputSchema
>

export const CommunityModerationReportSchema = z.object({
  id: UuidSchema,
  reporterId: UuidSchema,
  targetType: CommunityReportTargetTypeSchema,
  targetId: UuidSchema,
  reason: CommunityReportReasonSchema,
  description: z.string(),
  status: CommunityReportStatusSchema,
  createdAt: TimestampSchema,
  resolvedAt: TimestampSchema.nullable().optional(),
  resolvedBy: UuidSchema.nullable().optional(),
})
export type CommunityModerationReport = z.infer<typeof CommunityModerationReportSchema>

export const CommunityModerationReportListInputSchema = z.object({
  status: CommunityReportStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityModerationReportListInput = z.infer<
  typeof CommunityModerationReportListInputSchema
>

export const CommunityModerationReportListOutputSchema = z.object({
  items: z.array(CommunityModerationReportSchema),
})
export type CommunityModerationReportListOutput = z.infer<
  typeof CommunityModerationReportListOutputSchema
>

export const CommunityModerationReportResolveInputSchema = z.object({
  reportId: UuidSchema,
  action: z.enum([
    'suspend_resource',
    'suspend_and_ban_author',
    'ban_user',
    'delete_comment',
    'cancel_task',
    'dismiss_report',
  ]),
  note: z.string().optional(),
})
export type CommunityModerationReportResolveInput = z.infer<
  typeof CommunityModerationReportResolveInputSchema
>

export const CommunityModerationResourceActionInputSchema = z.object({
  resourceId: UuidSchema,
  reason: z.string().optional(),
  note: z.string().optional(),
})
export type CommunityModerationResourceActionInput = z.infer<
  typeof CommunityModerationResourceActionInputSchema
>

export const CommunityModerationResourceActionOutputSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  status: CommunityResourceStatusSchema,
})
export type CommunityModerationResourceActionOutput = z.infer<
  typeof CommunityModerationResourceActionOutputSchema
>

export const CommunityModerationUserBanInputSchema = z.object({
  userId: UuidSchema,
  durationHours: z.number().int().positive().optional(),
  reason: z.string().optional(),
})
export type CommunityModerationUserBanInput = z.infer<typeof CommunityModerationUserBanInputSchema>

export const CommunityModerationUserUnbanInputSchema = z.object({
  userId: UuidSchema,
})
export type CommunityModerationUserUnbanInput = z.infer<
  typeof CommunityModerationUserUnbanInputSchema
>

export const CommunityModerationDeviceUnbanInputSchema = z.object({
  deviceId: z.string().min(1),
})
export type CommunityModerationDeviceUnbanInput = z.infer<
  typeof CommunityModerationDeviceUnbanInputSchema
>

export const CommunityModerationLogSchema = z.object({
  id: UuidSchema,
  moderatorId: UuidSchema,
  action: z.string(),
  targetType: z.string(),
  targetId: UuidSchema,
  reason: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()),
  createdAt: TimestampSchema,
})
export type CommunityModerationLog = z.infer<typeof CommunityModerationLogSchema>

export const CommunityModerationLogsListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityModerationLogsListInput = z.infer<
  typeof CommunityModerationLogsListInputSchema
>

export const CommunityModerationLogsListOutputSchema = z.object({
  items: z.array(CommunityModerationLogSchema),
})
export type CommunityModerationLogsListOutput = z.infer<
  typeof CommunityModerationLogsListOutputSchema
>

export const CommunityModerationScanResourceSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  resourceType: CommunityResourceTypeSchema,
  status: CommunityResourceStatusSchema,
  authorId: UuidSchema,
  authorName: z.string(),
  createdAt: TimestampSchema,
})
export type CommunityModerationScanResource = z.infer<
  typeof CommunityModerationScanResourceSchema
>

export const CommunityModerationScanMessageSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  authorName: z.string(),
  body: z.string(),
  createdAt: TimestampSchema,
})
export type CommunityModerationScanMessage = z.infer<typeof CommunityModerationScanMessageSchema>

export const CommunityModerationScanTaskSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  publisherId: UuidSchema,
  publisherName: z.string(),
  status: CommunityTaskStatusSchema,
  createdAt: TimestampSchema,
})
export type CommunityModerationScanTask = z.infer<typeof CommunityModerationScanTaskSchema>

export const CommunityDeviceKindSchema = z.enum(['desktop', 'mobile'])
export type CommunityDeviceKind = z.infer<typeof CommunityDeviceKindSchema>

export const CommunityModerationScanDeviceSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  deviceKind: CommunityDeviceKindSchema,
  userId: UuidSchema,
  userName: z.string(),
  lastSeenAt: TimestampSchema,
})
export type CommunityModerationScanDevice = z.infer<typeof CommunityModerationScanDeviceSchema>

export const CommunityModerationScanBannedUserSchema = z.object({
  userId: UuidSchema,
  displayName: z.string(),
  bannedUntil: TimestampSchema.nullable().optional(),
  bannedAt: TimestampSchema,
})
export type CommunityModerationScanBannedUser = z.infer<
  typeof CommunityModerationScanBannedUserSchema
>

export const CommunityModerationScanBannedDeviceSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  userId: UuidSchema,
  userName: z.string(),
  reason: z.string().nullable().optional(),
  bannedAt: TimestampSchema,
  bannedUntil: TimestampSchema.nullable().optional(),
})
export type CommunityModerationScanBannedDevice = z.infer<
  typeof CommunityModerationScanBannedDeviceSchema
>

export const CommunityModerationDeviceBanInputSchema = z.object({
  deviceId: z.string().min(1),
  userId: UuidSchema,
  deviceName: z.string(),
  durationHours: z.number().int().positive().optional(),
  reason: z.string().optional(),
})
export type CommunityModerationDeviceBanInput = z.infer<
  typeof CommunityModerationDeviceBanInputSchema
>

export const CommunityModerationScanOutputSchema = z.object({
  scannedAt: TimestampSchema,
  onlineKnowledgeCount: z.number().int().nonnegative(),
  onlineMcpCount: z.number().int().nonnegative(),
  onlineSkillCount: z.number().int().nonnegative(),
  onlineWorkflowCount: z.number().int().nonnegative(),
  onlineDesktopDeviceCount: z.number().int().nonnegative(),
  onlineMobileDeviceCount: z.number().int().nonnegative(),
  openReportCount: z.number().int().nonnegative(),
  pendingReviewCount: z.number().int().nonnegative(),
  boardMessageCount: z.number().int().nonnegative(),
  activeTaskCount: z.number().int().nonnegative(),
  onlineResources: z.array(CommunityModerationScanResourceSchema),
  onlineDesktopDevices: z.array(CommunityModerationScanDeviceSchema),
  onlineMobileDevices: z.array(CommunityModerationScanDeviceSchema),
  openReports: z.array(CommunityModerationReportSchema),
  pendingReview: z.array(CommunityModerationScanResourceSchema),
  recentMessages: z.array(CommunityModerationScanMessageSchema),
  activeTasks: z.array(CommunityModerationScanTaskSchema),
  bannedUsers: z.array(CommunityModerationScanBannedUserSchema).default([]),
  bannedDevices: z.array(CommunityModerationScanBannedDeviceSchema).default([]),
})
export type CommunityModerationScanOutput = z.infer<typeof CommunityModerationScanOutputSchema>

// --- Admin management ---

export const CommunityModeratorUserSchema = z.object({
  id: UuidSchema,
  identityId: UuidSchema,
  displayName: z.string(),
  role: CommunityUserRoleSchema,
  createdAt: TimestampSchema,
})
export type CommunityModeratorUser = z.infer<typeof CommunityModeratorUserSchema>

export const CommunityModeratorListOutputSchema = z.object({
  items: z.array(CommunityModeratorUserSchema),
})
export type CommunityModeratorListOutput = z.infer<typeof CommunityModeratorListOutputSchema>

export const CommunityUserSearchInputSchema = z.object({
  q: z.string(),
  limit: z.number().int().min(1).max(50).optional(),
})
export type CommunityUserSearchInput = z.infer<typeof CommunityUserSearchInputSchema>

export const CommunityAdminAppointInputSchema = z.object({
  userId: UuidSchema,
})
export type CommunityAdminAppointInput = z.infer<typeof CommunityAdminAppointInputSchema>

export const CommunityAdminRevokeInputSchema = z.object({
  userId: UuidSchema,
})
export type CommunityAdminRevokeInput = z.infer<typeof CommunityAdminRevokeInputSchema>

export const CommunityYjsSetEnabledInputSchema = z.object({
  enabled: z.boolean(),
})
export type CommunityYjsSetEnabledInput = z.infer<typeof CommunityYjsSetEnabledInputSchema>

export const CommunityCidSetEnabledInputSchema = z.object({
  enabled: z.boolean(),
})
export type CommunityCidSetEnabledInput = z.infer<typeof CommunityCidSetEnabledInputSchema>
