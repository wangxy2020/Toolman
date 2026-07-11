import { z } from 'zod'
import { UuidSchema } from './base.js'
import {
  PmDomainSchema,
  PmProjectSchema,
  PmProjectStatusSchema,
  PmWorkItemPrioritySchema,
  PmWorkItemSchema,
  PmWorkItemStatusSchema,
  PmWorkItemTypeSchema,
} from '../project-management/pm-types.js'

export const PmProjectListInputSchema = z.object({
  workspaceId: UuidSchema,
  domain: PmDomainSchema.optional(),
  limit: z.number().int().positive().max(500).optional(),
})

export const PmProjectListOutputSchema = z.object({
  projects: z.array(PmProjectSchema),
})

export const PmProjectGetInputSchema = z.object({
  id: UuidSchema,
})

export const PmProjectCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  status: PmProjectStatusSchema.optional(),
  domain: PmDomainSchema,
  workspaceRoot: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const PmProjectUpdateInputSchema = z.object({
  id: UuidSchema,
  code: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(200).optional(),
  status: PmProjectStatusSchema.optional(),
  domain: PmDomainSchema.optional(),
  workspaceRoot: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const PmProjectDeleteInputSchema = z.object({
  id: UuidSchema,
})

export const PmWorkItemListInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema.optional(),
  parentId: UuidSchema.optional(),
  rootOnly: z.boolean().optional(),
  domain: PmDomainSchema.optional(),
  status: PmWorkItemStatusSchema.optional(),
  priority: PmWorkItemPrioritySchema.optional(),
  type: PmWorkItemTypeSchema.optional(),
  assignee: z.string().min(1).max(200).optional(),
  urgentOnly: z.boolean().optional(),
  limit: z.number().int().positive().max(1000).optional(),
})

export const PmWorkItemListOutputSchema = z.object({
  items: z.array(PmWorkItemSchema),
})

export const PmWorkItemGetInputSchema = z.object({
  id: UuidSchema,
})

export const PmWorkItemCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema,
  parentId: UuidSchema.optional(),
  type: PmWorkItemTypeSchema.optional(),
  title: z.string().min(1).max(500),
  status: PmWorkItemStatusSchema.optional(),
  priority: PmWorkItemPrioritySchema.optional(),
  domain: PmDomainSchema,
  assignee: z.string().optional(),
  description: z.string().optional(),
  startDate: z.number().int().optional(),
  dueDate: z.number().int().optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const PmWorkItemUpdateInputSchema = z.object({
  id: UuidSchema,
  parentId: UuidSchema.nullable().optional(),
  type: PmWorkItemTypeSchema.optional(),
  title: z.string().min(1).max(500).optional(),
  status: PmWorkItemStatusSchema.optional(),
  priority: PmWorkItemPrioritySchema.optional(),
  domain: PmDomainSchema.optional(),
  assignee: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  startDate: z.number().int().nullable().optional(),
  dueDate: z.number().int().nullable().optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const PmWorkItemDeleteInputSchema = z.object({
  id: UuidSchema,
})

export type PmProjectListInput = z.infer<typeof PmProjectListInputSchema>
export type PmProjectListOutput = z.infer<typeof PmProjectListOutputSchema>
export type PmProjectCreateInput = z.infer<typeof PmProjectCreateInputSchema>
export type PmProjectUpdateInput = z.infer<typeof PmProjectUpdateInputSchema>
export type PmWorkItemListInput = z.infer<typeof PmWorkItemListInputSchema>
export type PmWorkItemListOutput = z.infer<typeof PmWorkItemListOutputSchema>
export type PmWorkItemCreateInput = z.infer<typeof PmWorkItemCreateInputSchema>
export type PmWorkItemUpdateInput = z.infer<typeof PmWorkItemUpdateInputSchema>

export {
  PmDomainSettingsSchema,
  PmDomainSettingsGetInputSchema,
  PmDomainSettingsGetOutputSchema,
  PmDomainSettingsSetInputSchema,
} from '../project-management/pm-domain-settings.js'

export {
  P2pPmShareDomainInputSchema,
  P2pPmShareDomainOutputSchema,
} from '../project-management/pm-p2p-types.js'
