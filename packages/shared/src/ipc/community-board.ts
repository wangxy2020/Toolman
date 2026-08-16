import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { CommunityAuthorSummarySchema } from './community-enums.js'

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

export const CommunityBoardMessagePatchInputSchema = z.object({
  messageId: UuidSchema,
  body: z.string().min(1).max(5000),
})
export type CommunityBoardMessagePatchInput = z.infer<
  typeof CommunityBoardMessagePatchInputSchema
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
