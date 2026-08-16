import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import {
  CommunityAuthorSummarySchema,
  CommunityMarketplaceSortSchema,
  CommunityResourceStatusSchema,
  CommunityResourceTypeSchema,
  CommunityResourceVisibilitySchema,
} from './community-enums.js'

// --- Marketplace ---

export const CommunityResourceListInputSchema = z.object({
  resourceType: CommunityResourceTypeSchema.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  q: z.string().optional(),
  sort: CommunityMarketplaceSortSchema.optional(),
  visibility: CommunityResourceVisibilitySchema.optional(),
  status: CommunityResourceStatusSchema.optional(),
  authorId: UuidSchema.optional(),
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
  /** `p2p` = discovered via federation; `hub` = local/remote Community Hub HTTP */
  federationSource: z.enum(['hub', 'p2p', 'hub-peer']).optional(),
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
  /** When known from create step, skips an extra hub round-trip before upload. */
  resourceType: CommunityResourceTypeSchema.optional(),
  version: z.string().min(1).max(64),
  changelog: z.string().max(2000).optional(),
  /** Absolute path to package file readable by Main process */
  packagePath: z.string().min(1),
  originalFilename: z.string().optional(),
})
export type CommunityResourcePublishInput = z.infer<typeof CommunityResourcePublishInputSchema>

export const CommunityMcpPackageExportInputSchema = z.object({
  mcpServerId: z.string().min(1).max(64),
})
export type CommunityMcpPackageExportInput = z.infer<typeof CommunityMcpPackageExportInputSchema>

export const CommunityMcpPackagePrepareInputSchema = z.object({
  packagePath: z.string().min(1),
  title: z.string().max(128).optional(),
})
export type CommunityMcpPackagePrepareInput = z.infer<typeof CommunityMcpPackagePrepareInputSchema>

export const CommunityMcpPackagePrepareOutputSchema = z.object({
  packagePath: z.string().min(1),
  normalized: z.boolean(),
  message: z.string().optional(),
})
export type CommunityMcpPackagePrepareOutput = z.infer<typeof CommunityMcpPackagePrepareOutputSchema>

export const CommunitySkillPackagePrepareInputSchema = CommunityMcpPackagePrepareInputSchema
export type CommunitySkillPackagePrepareInput = z.infer<typeof CommunitySkillPackagePrepareInputSchema>
export const CommunitySkillPackagePrepareOutputSchema = CommunityMcpPackagePrepareOutputSchema
export type CommunitySkillPackagePrepareOutput = z.infer<typeof CommunitySkillPackagePrepareOutputSchema>

export const CommunityWorkflowPackagePrepareInputSchema = CommunityMcpPackagePrepareInputSchema
export type CommunityWorkflowPackagePrepareInput = z.infer<
  typeof CommunityWorkflowPackagePrepareInputSchema
>
export const CommunityWorkflowPackagePrepareOutputSchema = CommunityMcpPackagePrepareOutputSchema
export type CommunityWorkflowPackagePrepareOutput = z.infer<
  typeof CommunityWorkflowPackagePrepareOutputSchema
>

export const CommunityKnowledgePackagePrepareInputSchema = CommunityMcpPackagePrepareInputSchema
export type CommunityKnowledgePackagePrepareInput = z.infer<
  typeof CommunityKnowledgePackagePrepareInputSchema
>
export const CommunityKnowledgePackagePrepareOutputSchema = CommunityMcpPackagePrepareOutputSchema
export type CommunityKnowledgePackagePrepareOutput = z.infer<
  typeof CommunityKnowledgePackagePrepareOutputSchema
>

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

export const CommunityResourcePackageReviewInputSchema = z.object({
  resourceId: UuidSchema,
})
export type CommunityResourcePackageReviewInput = z.infer<
  typeof CommunityResourcePackageReviewInputSchema
>

export const CommunityResourcePackageReviewOpenOutputSchema = z.object({
  opened: z.boolean(),
  error: z.string().optional(),
})
export type CommunityResourcePackageReviewOpenOutput = z.infer<
  typeof CommunityResourcePackageReviewOpenOutputSchema
>

export const CommunityResourcePackageReviewDownloadOutputSchema = z.object({
  saved: z.boolean(),
  path: z.string().nullable(),
})
export type CommunityResourcePackageReviewDownloadOutput = z.infer<
  typeof CommunityResourcePackageReviewDownloadOutputSchema
>
