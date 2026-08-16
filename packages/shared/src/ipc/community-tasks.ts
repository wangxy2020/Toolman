import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import {
  CommunityPublisherSummarySchema,
  CommunityTaskStatusSchema,
  CommunityTaskTypeSchema,
} from './community-enums.js'

// --- Tasks ---

export const CommunityTaskItemSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  description: z.string(),
  publisher: CommunityPublisherSummarySchema,
  assigneeId: UuidSchema.nullable().optional(),
  resourceId: UuidSchema.nullable().optional(),
  taskType: CommunityTaskTypeSchema,
  budgetAmount: z.number(),
  budgetCurrency: z.string(),
  deadlineAt: TimestampSchema.nullable().optional(),
  status: CommunityTaskStatusSchema,
  tags: z.array(z.string()),
  attachmentsJson: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable().optional(),
})
export type CommunityTaskItem = z.infer<typeof CommunityTaskItemSchema>

export const CommunityTaskListInputSchema = z.object({
  taskType: CommunityTaskTypeSchema.optional(),
  status: CommunityTaskStatusSchema.optional(),
  publisherId: UuidSchema.optional(),
  q: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityTaskListInput = z.infer<typeof CommunityTaskListInputSchema>

export const CommunityTaskListOutputSchema = z.object({
  items: z.array(CommunityTaskItemSchema),
})
export type CommunityTaskListOutput = z.infer<typeof CommunityTaskListOutputSchema>

export const CommunityTaskGetInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityTaskGetInput = z.infer<typeof CommunityTaskGetInputSchema>

export const CommunityTaskCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  taskType: CommunityTaskTypeSchema,
  budgetAmount: z.number().nonnegative().optional(),
  budgetCurrency: z.string().optional(),
  deadlineAt: TimestampSchema.optional(),
  tags: z.array(z.string()).optional(),
  resourceId: UuidSchema.optional(),
})
export type CommunityTaskCreateInput = z.infer<typeof CommunityTaskCreateInputSchema>

export const CommunityTaskPatchInputSchema = z.object({
  id: UuidSchema,
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  taskType: CommunityTaskTypeSchema.optional(),
  budgetAmount: z.number().nonnegative().optional(),
  budgetCurrency: z.string().optional(),
  deadlineAt: TimestampSchema.nullable().optional(),
  tags: z.array(z.string()).optional(),
  resourceId: UuidSchema.nullable().optional(),
})
export type CommunityTaskPatchInput = z.infer<typeof CommunityTaskPatchInputSchema>

export const CommunityTaskIdInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityTaskIdInput = z.infer<typeof CommunityTaskIdInputSchema>

export const CommunityTaskDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})
export type CommunityTaskDeleteOutput = z.infer<typeof CommunityTaskDeleteOutputSchema>

export const CommunityTaskApplyInputSchema = z.object({
  taskId: UuidSchema,
  proposal: z.string().min(1).max(5000),
  quotedAmount: z.number().nonnegative(),
})
export type CommunityTaskApplyInput = z.infer<typeof CommunityTaskApplyInputSchema>

export const CommunityTaskApplicationSchema = z.object({
  id: UuidSchema,
  taskId: UuidSchema,
  applicantId: UuidSchema,
  proposal: z.string(),
  quotedAmount: z.number(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  createdAt: TimestampSchema,
})
export type CommunityTaskApplication = z.infer<typeof CommunityTaskApplicationSchema>

export const CommunityTaskApplicationsListInputSchema = z.object({
  taskId: UuidSchema,
})
export type CommunityTaskApplicationsListInput = z.infer<
  typeof CommunityTaskApplicationsListInputSchema
>

export const CommunityTaskApplicationsListOutputSchema = z.object({
  items: z.array(CommunityTaskApplicationSchema),
})
export type CommunityTaskApplicationsListOutput = z.infer<
  typeof CommunityTaskApplicationsListOutputSchema
>

export const CommunityTaskApplicationAcceptInputSchema = z.object({
  taskId: UuidSchema,
  applicationId: UuidSchema,
})
export type CommunityTaskApplicationAcceptInput = z.infer<
  typeof CommunityTaskApplicationAcceptInputSchema
>

export const CommunityTaskDeliverInputSchema = z.object({
  taskId: UuidSchema,
  /** Absolute path to delivery package file */
  packagePath: z.string().min(1),
  originalFilename: z.string().optional(),
  notes: z.string().optional(),
})
export type CommunityTaskDeliverInput = z.infer<typeof CommunityTaskDeliverInputSchema>

export const CommunityTaskDeliverySchema = z.object({
  id: UuidSchema,
  taskId: UuidSchema,
  submitterId: UuidSchema,
  packagePath: z.string(),
  notes: z.string().nullable().optional(),
  status: z.enum(['submitted', 'accepted', 'rejected']),
  createdAt: TimestampSchema,
})
export type CommunityTaskDelivery = z.infer<typeof CommunityTaskDeliverySchema>

export const CommunityTaskRejectDeliveryInputSchema = z.object({
  taskId: UuidSchema,
  reason: z.string().optional(),
})
export type CommunityTaskRejectDeliveryInput = z.infer<typeof CommunityTaskRejectDeliveryInputSchema>

export const CommunityTaskReviewCreateInputSchema = z.object({
  taskId: UuidSchema,
  rating: z.number().int().min(1).max(5),
  body: z.string().min(1).max(5000),
  revieweeId: UuidSchema,
})
export type CommunityTaskReviewCreateInput = z.infer<typeof CommunityTaskReviewCreateInputSchema>

export const CommunityTaskReviewAuthorSchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
})
export type CommunityTaskReviewAuthor = z.infer<typeof CommunityTaskReviewAuthorSchema>

export const CommunityTaskReviewItemSchema = z.object({
  id: UuidSchema,
  taskId: UuidSchema,
  reviewerId: UuidSchema,
  revieweeId: UuidSchema,
  reviewer: CommunityTaskReviewAuthorSchema,
  reviewee: CommunityTaskReviewAuthorSchema,
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type CommunityTaskReviewItem = z.infer<typeof CommunityTaskReviewItemSchema>

export const CommunityTaskReviewListInputSchema = z.object({
  taskId: UuidSchema,
})
export type CommunityTaskReviewListInput = z.infer<typeof CommunityTaskReviewListInputSchema>

export const CommunityTaskReviewListOutputSchema = z.object({
  items: z.array(CommunityTaskReviewItemSchema),
})
export type CommunityTaskReviewListOutput = z.infer<typeof CommunityTaskReviewListOutputSchema>
