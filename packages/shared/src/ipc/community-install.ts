import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import {
  CommunityInstallStatusSchema,
  CommunityResourceTypeSchema,
} from './community-enums.js'

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
