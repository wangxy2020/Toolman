import { z } from 'zod'

export const CommunityYjsDomainSchema = z.enum(['profiles', 'board', 'comments', 'tasks'])
export type CommunityYjsDomain = z.infer<typeof CommunityYjsDomainSchema>

export const COMMUNITY_YJS_TOPIC_PREFIX = 'toolman/community/v1/'

export const CommunityYjsWireMessageSchema = z.object({
  v: z.literal(1),
  domain: CommunityYjsDomainSchema,
  update: z.string().min(1),
  originPeerId: z.string().optional(),
  at: z.number().int().positive(),
})
export type CommunityYjsWireMessage = z.infer<typeof CommunityYjsWireMessageSchema>

export const CommunityYjsUpdateEventSchema = z.object({
  domain: CommunityYjsDomainSchema,
  entityId: z.string(),
  action: z.enum(['upsert', 'delete']),
  entity: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.number().int().positive(),
})
export type CommunityYjsUpdateEvent = z.infer<typeof CommunityYjsUpdateEventSchema>

export const CommunityYjsStatusSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  subscribedDomains: z.array(CommunityYjsDomainSchema),
  localPeerId: z.string().nullable(),
  localDid: z.string().nullable(),
  requireSignedUpdates: z.boolean(),
  acceptedSignedUpdates: z.number().int().nonnegative(),
  rejectedUnsignedUpdates: z.number().int().nonnegative(),
  verifyFailures: z.number().int().nonnegative(),
  blockedDidCount: z.number().int().nonnegative(),
  lastError: z.string().nullable().optional(),
})
export type CommunityYjsStatus = z.infer<typeof CommunityYjsStatusSchema>

export function communityYjsTopicForDomain(domain: CommunityYjsDomain): string {
  return `${COMMUNITY_YJS_TOPIC_PREFIX}${domain}`
}
