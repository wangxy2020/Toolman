import { z } from 'zod'

import { CommunityAuthorSummarySchema, CommunityResourceTypeSchema } from '../ipc/community.js'

export const FEDERATION_CATALOG_TOPIC = 'toolman/federation/v1/catalog'

export const FederatedResourceCatalogEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(''),
  author: CommunityAuthorSummarySchema,
  version: z.string().min(1),
  tags: z.array(z.string()).default([]),
  category: z.string().default(''),
  resourceType: CommunityResourceTypeSchema,
  resourceSize: z.number().int().nonnegative().default(0),
  rootCid: z.string().min(1),
  license: z.string().default(''),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
})
export type FederatedResourceCatalogEntry = z.infer<typeof FederatedResourceCatalogEntrySchema>

export const FederatedCatalogWireMessageSchema = z.object({
  v: z.literal(1),
  entry: FederatedResourceCatalogEntrySchema,
  signerDid: z.string().min(1),
  publicKey: z.string().min(1),
  deviceId: z.string().uuid(),
  at: z.number().int().positive(),
  signature: z.string().min(1),
})
export type FederatedCatalogWireMessage = z.infer<typeof FederatedCatalogWireMessageSchema>

export const FederatedCatalogUpdateEventSchema = z.object({
  action: z.enum(['upsert', 'delete']),
  entry: FederatedResourceCatalogEntrySchema.optional(),
  resourceId: z.string().uuid().optional(),
})
export type FederatedCatalogUpdateEvent = z.infer<typeof FederatedCatalogUpdateEventSchema>

export function buildFederatedCatalogSignedPayload(entry: FederatedResourceCatalogEntry): string {
  const tagSummary = entry.tags.join(',')
  return [
    'toolman:federation-catalog:v1',
    entry.id,
    entry.resourceType,
    entry.version,
    entry.rootCid,
    entry.title,
    String(entry.updatedAt),
    tagSummary,
  ].join('|')
}
