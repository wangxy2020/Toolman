import { z } from 'zod'
import { UuidSchema } from '../ipc/base.js'

export const PmProjectStatusSchema = z.enum([
  'planning',
  'active',
  'on_hold',
  'completed',
  'archived',
])

export const PmWorkItemTypeSchema = z.enum(['task', 'milestone', 'phase', 'issue', 'wbs_node'])

export const PmWorkItemStatusSchema = z.enum([
  'todo',
  'in_progress',
  'done',
  'blocked',
  'cancelled',
])

export const PmWorkItemPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent'])

/** Sidebar domain key for filtering PM entities. */
export const PmDomainSchema = z.enum([
  'all_projects',
  'urgent_tasks',
  'key_projects',
  'progress_management',
  'cost_management',
  'resource_management',
  'security_management',
  'quality_management',
  'archive_management',
  'technical_management',
  'contract_risk_management',
  'operations_management',
])

export type PmProjectStatus = z.infer<typeof PmProjectStatusSchema>
export type PmWorkItemType = z.infer<typeof PmWorkItemTypeSchema>
export type PmWorkItemStatus = z.infer<typeof PmWorkItemStatusSchema>
export type PmWorkItemPriority = z.infer<typeof PmWorkItemPrioritySchema>
export type PmDomain = z.infer<typeof PmDomainSchema>

export const PmProjectSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  status: PmProjectStatusSchema,
  domain: PmDomainSchema,
  workspaceRoot: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type PmProject = z.infer<typeof PmProjectSchema>

export const PmWorkItemSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  workspaceId: UuidSchema,
  parentId: UuidSchema.optional(),
  type: PmWorkItemTypeSchema,
  title: z.string().min(1).max(500),
  status: PmWorkItemStatusSchema,
  priority: PmWorkItemPrioritySchema,
  domain: PmDomainSchema,
  assignee: z.string().optional(),
  description: z.string().optional(),
  startDate: z.number().int().optional(),
  dueDate: z.number().int().optional(),
  progressPercent: z.number().int().min(0).max(100),
  sortOrder: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type PmWorkItem = z.infer<typeof PmWorkItemSchema>
