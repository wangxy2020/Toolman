import { z } from 'zod'
import { ProductSkuSchema } from './auth.js'

export const BillingChannelSchema = z.enum(['alipay', 'wechat'])
export type BillingChannel = z.infer<typeof BillingChannelSchema>

export const BillingOrderStatusSchema = z.enum(['pending', 'paid', 'failed', 'expired'])
export type BillingOrderStatus = z.infer<typeof BillingOrderStatusSchema>

export const BillingPlanSchema = z.object({
  sku: ProductSkuSchema,
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  groupMaxMembers: z.number().int().positive(),
  billingPeriodLabel: z.string(),
})
export type BillingPlan = z.infer<typeof BillingPlanSchema>

export const BillingListPlansOutputSchema = z.object({
  plans: z.array(BillingPlanSchema),
  mockMode: z.boolean(),
  apiConfigured: z.boolean(),
})
export type BillingListPlansOutput = z.infer<typeof BillingListPlansOutputSchema>

export const BillingCreateOrderInputSchema = z.object({
  sku: ProductSkuSchema,
  channel: BillingChannelSchema,
})
export type BillingCreateOrderInput = z.infer<typeof BillingCreateOrderInputSchema>

export const BillingOrderSchema = z.object({
  orderId: z.string().min(1),
  sku: ProductSkuSchema,
  channel: BillingChannelSchema,
  amountCents: z.number().int().nonnegative(),
  status: BillingOrderStatusSchema,
  qrUrl: z.string().nullable(),
  qrImageDataUrl: z.string().nullable().optional(),
  mockMode: z.boolean(),
  message: z.string().optional(),
  paidAt: z.number().int().positive().nullable().optional(),
})
export type BillingOrder = z.infer<typeof BillingOrderSchema>

export const BillingCreateOrderOutputSchema = BillingOrderSchema
export type BillingCreateOrderOutput = z.infer<typeof BillingCreateOrderOutputSchema>

export const BillingGetOrderStatusInputSchema = z.object({
  orderId: z.string().min(1),
})
export type BillingGetOrderStatusInput = z.infer<typeof BillingGetOrderStatusInputSchema>

export const BillingGetOrderStatusOutputSchema = BillingOrderSchema
export type BillingGetOrderStatusOutput = z.infer<typeof BillingGetOrderStatusOutputSchema>

export const BillingMockPayInputSchema = z.object({
  orderId: z.string().min(1),
})
export type BillingMockPayInput = z.infer<typeof BillingMockPayInputSchema>

export const BillingMockPayOutputSchema = z.object({
  order: BillingOrderSchema,
  sessionRefreshed: z.boolean(),
})
export type BillingMockPayOutput = z.infer<typeof BillingMockPayOutputSchema>
