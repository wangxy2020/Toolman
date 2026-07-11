import { z } from 'zod'
import { UuidSchema } from '../ipc/base.js'
import { PmScheduleBaselineSchema, PmWorkItemRelationSchema } from './pm-schedule-types.js'
import { PmDocumentLinkSchema, PmTimeEntrySchema } from './pm-execution-types.js'
import { PmDomainSchema, PmProjectSchema, PmWorkItemSchema } from './pm-types.js'

export const PM_P2P_RESOURCE_PREFIX = 'pm:'

export function buildPmP2pResourceId(sourceWorkspaceId: string, domain: string): string {
  return `${PM_P2P_RESOURCE_PREFIX}${sourceWorkspaceId}:${domain}`
}

export function parsePmP2pResourceId(resourceId: string): { sourceWorkspaceId: string; domain: string } | null {
  if (!resourceId.startsWith(PM_P2P_RESOURCE_PREFIX)) return null
  const rest = resourceId.slice(PM_P2P_RESOURCE_PREFIX.length)
  const separator = rest.indexOf(':')
  if (separator <= 0) return null
  return {
    sourceWorkspaceId: rest.slice(0, separator),
    domain: rest.slice(separator + 1),
  }
}

export const PmP2pSnapshotPayloadSchema = z.object({
  source_workspace_id: UuidSchema,
  domain: PmDomainSchema,
  projects: z.array(PmProjectSchema),
  work_items: z.array(PmWorkItemSchema),
  relations: z.array(PmWorkItemRelationSchema).default([]),
  baselines: z.array(PmScheduleBaselineSchema).default([]),
  time_entries: z.array(PmTimeEntrySchema).default([]),
  document_links: z.array(PmDocumentLinkSchema).default([]),
})

export const PmP2pWorkItemDeltaPayloadSchema = z.object({
  source_workspace_id: UuidSchema,
  domain: PmDomainSchema,
  entity: z.literal('work_item'),
  action: z.enum(['upsert', 'delete']),
  work_item: PmWorkItemSchema.optional(),
  work_item_id: UuidSchema.optional(),
})

/** Legacy work-item deltas emitted before entity discriminator was added. */
export const PmP2pLegacyWorkItemDeltaPayloadSchema = z.object({
  source_workspace_id: UuidSchema,
  domain: PmDomainSchema,
  action: z.enum(['upsert', 'delete']),
  work_item: PmWorkItemSchema.optional(),
  work_item_id: UuidSchema.optional(),
})

export const PmP2pRelationDeltaPayloadSchema = z.object({
  source_workspace_id: UuidSchema,
  domain: PmDomainSchema,
  entity: z.literal('relation'),
  action: z.enum(['upsert', 'delete']),
  relation: PmWorkItemRelationSchema.optional(),
  relation_id: UuidSchema.optional(),
})

export const PmP2pBaselineDeltaPayloadSchema = z.object({
  source_workspace_id: UuidSchema,
  domain: PmDomainSchema,
  entity: z.literal('baseline'),
  action: z.enum(['upsert', 'delete']),
  baseline: PmScheduleBaselineSchema.optional(),
  baseline_id: UuidSchema.optional(),
})

export const PmP2pTimeEntryDeltaPayloadSchema = z.object({
  source_workspace_id: UuidSchema,
  domain: PmDomainSchema,
  entity: z.literal('time_entry'),
  action: z.enum(['upsert', 'delete']),
  time_entry: PmTimeEntrySchema.optional(),
  time_entry_id: UuidSchema.optional(),
})

export const PmP2pDocumentLinkDeltaPayloadSchema = z.object({
  source_workspace_id: UuidSchema,
  domain: PmDomainSchema,
  entity: z.literal('document_link'),
  action: z.enum(['upsert', 'delete']),
  document_link: PmDocumentLinkSchema.optional(),
  document_link_id: UuidSchema.optional(),
})

export const PmP2pDeltaPayloadSchema = z.discriminatedUnion('entity', [
  PmP2pWorkItemDeltaPayloadSchema,
  PmP2pRelationDeltaPayloadSchema,
  PmP2pBaselineDeltaPayloadSchema,
  PmP2pTimeEntryDeltaPayloadSchema,
  PmP2pDocumentLinkDeltaPayloadSchema,
])

export const P2pPmShareDomainInputSchema = z.object({
  p2pWorkspaceId: UuidSchema,
  sourceWorkspaceId: UuidSchema,
  domain: PmDomainSchema,
  permission: z.enum(['read', 'write']).optional(),
})

export const P2pPmShareDomainOutputSchema = z.object({
  resourceId: z.string().min(1),
  eventId: z.string().min(1),
  projectCount: z.number().int().nonnegative(),
  workItemCount: z.number().int().nonnegative(),
})

export type P2pPmShareDomainInput = z.infer<typeof P2pPmShareDomainInputSchema>
export type P2pPmShareDomainOutput = z.infer<typeof P2pPmShareDomainOutputSchema>
export type PmP2pDeltaPayload = z.infer<typeof PmP2pDeltaPayloadSchema>

export function parsePmP2pDeltaPayload(payload: unknown): PmP2pDeltaPayload | null {
  const parsed = PmP2pDeltaPayloadSchema.safeParse(payload)
  if (parsed.success) {
    return parsed.data
  }
  const legacy = PmP2pLegacyWorkItemDeltaPayloadSchema.safeParse(payload)
  if (legacy.success) {
    return { ...legacy.data, entity: 'work_item' as const }
  }
  return null
}
