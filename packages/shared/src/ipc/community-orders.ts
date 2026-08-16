import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { CommunityOrderStatusSchema } from './community-enums.js'

// --- Orders ---

export const CommunityOrderCreateInputSchema = z.object({
  taskId: UuidSchema,
  amount: z.number().positive(),
  currency: z.string().min(1).max(8),
})
export type CommunityOrderCreateInput = z.infer<typeof CommunityOrderCreateInputSchema>

export const CommunityOrderItemSchema = z.object({
  id: UuidSchema,
  taskId: UuidSchema,
  payerId: UuidSchema,
  payeeId: UuidSchema,
  amount: z.number(),
  currency: z.string(),
  status: CommunityOrderStatusSchema,
  paymentProvider: z.string().nullable().optional(),
  externalOrderId: z.string().nullable().optional(),
  createdAt: TimestampSchema,
  paidAt: TimestampSchema.nullable().optional(),
})
export type CommunityOrderItem = z.infer<typeof CommunityOrderItemSchema>

export const CommunityOrderGetInputSchema = z.object({
  id: UuidSchema,
})
export type CommunityOrderGetInput = z.infer<typeof CommunityOrderGetInputSchema>

export const CommunityOrderUpdateStatusInputSchema = z.object({
  id: UuidSchema,
  status: CommunityOrderStatusSchema,
})
export type CommunityOrderUpdateStatusInput = z.infer<typeof CommunityOrderUpdateStatusInputSchema>
