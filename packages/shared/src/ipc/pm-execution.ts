import { z } from 'zod'
import { UuidSchema } from './base.js'
import { PmDocumentLinkSchema, PmTimeEntrySchema } from '../project-management/pm-execution-types.js'

export const PmTimeEntryListInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema.optional(),
  workItemId: UuidSchema.optional(),
  limit: z.number().int().positive().max(1000).optional(),
})

export const PmTimeEntryListOutputSchema = z.object({
  entries: z.array(PmTimeEntrySchema),
})

export const PmTimeEntryCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema,
  workItemId: UuidSchema.optional(),
  assignee: z.string().optional(),
  spentHours: z.number().positive().max(24 * 7),
  workDate: z.number().int(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const PmTimeEntryDeleteInputSchema = z.object({
  id: UuidSchema,
})

export const PmTimeEntryUpdateInputSchema = z.object({
  id: UuidSchema,
  workItemId: UuidSchema.nullable().optional(),
  assignee: z.string().nullable().optional(),
  spentHours: z.number().positive().max(24 * 7).optional(),
  workDate: z.number().int().optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const PmDocumentLinkListInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema.optional(),
  workItemId: UuidSchema.optional(),
  limit: z.number().int().positive().max(500).optional(),
})

export const PmDocumentLinkListOutputSchema = z.object({
  links: z.array(PmDocumentLinkSchema),
})

export const PmDocumentLinkCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema.optional(),
  workItemId: UuidSchema.optional(),
  knowledgeBaseId: UuidSchema,
  knowledgeDocumentId: UuidSchema,
  linkType: z.enum(['reference', 'deliverable', 'archive']).optional(),
  titleOverride: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const PmDocumentLinkDeleteInputSchema = z.object({
  id: UuidSchema,
})

export type PmTimeEntryCreateInput = z.infer<typeof PmTimeEntryCreateInputSchema>
export type PmTimeEntryUpdateInput = z.infer<typeof PmTimeEntryUpdateInputSchema>
export type PmDocumentLinkCreateInput = z.infer<typeof PmDocumentLinkCreateInputSchema>
