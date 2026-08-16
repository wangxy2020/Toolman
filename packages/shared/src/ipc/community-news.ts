import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import {
  CommunityAuthorSummarySchema,
  CommunityNewsSortSchema,
} from './community-enums.js'

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
