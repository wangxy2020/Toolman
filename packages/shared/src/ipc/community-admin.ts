import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { CommunityHubIdentityIdSchema } from './community-hub.js'
import { CommunityUserRoleSchema } from './community-enums.js'

// --- Admin management ---

export const CommunityModeratorUserSchema = z.object({
  id: UuidSchema,
  identityId: CommunityHubIdentityIdSchema,
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
