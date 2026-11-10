import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { CommunityAuthorSummarySchema } from './community-enums.js'

export const CommunityBoardMainIdSchema = z.literal('main')
export const CommunityCommentTargetIdSchema = z.union([UuidSchema, CommunityBoardMainIdSchema])

export const CommunityCommentTargetTypeSchema = z.enum(['resource', 'board', 'task'])
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
