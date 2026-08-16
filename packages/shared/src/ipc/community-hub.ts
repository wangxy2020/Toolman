import { z } from 'zod'
import {
  CommunityHubConfigSchema,
  CommunityHubModeSchema,
} from '../community/hub-config.js'
import { CommunityFederationConfigSchema } from '../community/federation-config.js'
import { FederationSyncStateStoreSchema } from '../community/federation-sync.js'
import { TimestampSchema, UuidSchema } from './base.js'
import { CommunityUserRoleSchema } from './community-enums.js'

// --- Hub ---

export const CommunityHubHealthOutputSchema = z.object({
  status: z.string(),
  version: z.string(),
  db: z.string(),
  dataDir: z.string().optional(),
  requireReview: z.boolean().optional(),
  userCount: z.number().int().nonnegative().optional(),
  resourceCount: z.number().int().nonnegative().optional(),
  federationPeering: z.boolean().optional(),
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

export const CommunityHubConfigUpdateInputSchema = CommunityHubConfigSchema
export type CommunityHubConfigUpdateInput = z.infer<typeof CommunityHubConfigUpdateInputSchema>

export const CommunityFederationStatusOutputSchema = z.object({
  hubConfigEditable: z.boolean(),
  hubConfig: CommunityHubConfigSchema,
  federationConfig: CommunityFederationConfigSchema,
  syncState: FederationSyncStateStoreSchema,
  federatedCatalogEntryCount: z.number().int().nonnegative(),
  libp2pBootstrapCount: z.number().int().nonnegative(),
})
export type CommunityFederationStatusOutput = z.infer<typeof CommunityFederationStatusOutputSchema>

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
