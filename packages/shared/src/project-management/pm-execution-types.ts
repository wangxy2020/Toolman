import { z } from 'zod'
import { UuidSchema } from '../ipc/base.js'

export const PmDocumentLinkTypeSchema = z.enum(['reference', 'deliverable', 'archive'])

export type PmDocumentLinkType = z.infer<typeof PmDocumentLinkTypeSchema>

export const PmTimeEntrySchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  projectId: UuidSchema,
  workItemId: UuidSchema.optional(),
  assignee: z.string().optional(),
  spentHours: z.number().positive().max(24 * 7),
  workDate: z.number().int(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type PmTimeEntry = z.infer<typeof PmTimeEntrySchema>

export const PmDocumentLinkSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  projectId: UuidSchema.optional(),
  workItemId: UuidSchema.optional(),
  knowledgeBaseId: UuidSchema,
  knowledgeDocumentId: UuidSchema,
  linkType: PmDocumentLinkTypeSchema,
  titleOverride: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type PmDocumentLink = z.infer<typeof PmDocumentLinkSchema>
