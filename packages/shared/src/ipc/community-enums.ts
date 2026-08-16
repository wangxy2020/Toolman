import { z } from 'zod'
import { UuidSchema } from './base.js'

// --- Shared enums ---

export const CommunityResourceTypeSchema = z.enum(['mcp', 'skill', 'workflow', 'task', 'knowledge'])
export type CommunityResourceType = z.infer<typeof CommunityResourceTypeSchema>

export const CommunityResourceVisibilitySchema = z.enum(['public', 'unlisted', 'private'])
export type CommunityResourceVisibility = z.infer<typeof CommunityResourceVisibilitySchema>

export const CommunityResourceStatusSchema = z.enum([
  'draft',
  'pending_review',
  'published',
  'rejected',
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
  'pending_review',
  'open',
  'assigned',
  'in_progress',
  'delivered',
  'completed',
  'rejected',
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
