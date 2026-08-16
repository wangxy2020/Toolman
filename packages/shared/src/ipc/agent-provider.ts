import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'

export const ProviderTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'ollama',
  'openai_compatible',
  'azure_openai',
])

export const ProviderModelTypesSchema = z.object({
  vision: z.boolean().optional(),
  web: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  tools: z.boolean().optional(),
  rerank: z.boolean().optional(),
  embedding: z.boolean().optional(),
})

export const ProviderModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string().optional(),
  types: ProviderModelTypesSchema.optional(),
  incrementalOutput: z.boolean().optional(),
  currency: z.enum(['USD', 'CNY']).optional(),
  inputPrice: z.number().optional(),
})

export type ProviderModel = z.infer<typeof ProviderModelSchema>

export const ProviderSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  name: z.string(),
  type: ProviderTypeSchema,
  baseUrl: z.string().nullable(),
  isEnabled: z.boolean(),
  presetId: z.string().nullable().optional(),
  models: z.array(ProviderModelSchema),
  hasApiKey: z.boolean(),
  apiKeyRotate: z.boolean().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type Provider = z.infer<typeof ProviderSchema>
export type ProviderType = z.infer<typeof ProviderTypeSchema>

export const ProviderListInputSchema = z.object({
  workspaceId: UuidSchema,
  enabledOnly: z.boolean().default(false),
})

export const ProviderCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  name: z.string().min(1),
  type: ProviderTypeSchema,
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  presetId: z.string().optional(),
})

export const ProviderUpdateInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).optional(),
  type: ProviderTypeSchema.optional(),
  baseUrl: z.string().url().nullable().optional(),
  apiKey: z.string().optional(),
  isEnabled: z.boolean().optional(),
  presetId: z.string().optional(),
  apiKeyRotate: z.boolean().optional(),
  models: z.array(ProviderModelSchema).optional(),
})

export const ProviderDeleteInputSchema = z.object({ id: UuidSchema })
export const ProviderDeleteOutputSchema = z.object({ deleted: z.boolean() })

export const ProviderTestInputSchema = z.object({
  id: UuidSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().url().nullable().optional(),
})
export const ProviderTestOutputSchema = z.object({
  success: z.boolean(),
  latencyMs: z.number(),
  error: z.string().optional(),
})

export const ProviderRevealApiKeyInputSchema = z.object({ id: UuidSchema })
export const ProviderRevealApiKeyOutputSchema = z.object({ apiKey: z.string() })

export const ProviderFetchModelsInputSchema = z.object({
  id: UuidSchema,
  persist: z.boolean().default(true),
})
export const ProviderFetchModelsOutputSchema = z.object({
  models: z.array(ProviderModelSchema),
})

export const ProviderPullModelInputSchema = z.object({
  id: UuidSchema,
  modelId: z.string().min(1),
})
export const ProviderPullModelOutputSchema = z.object({
  modelId: z.string(),
  success: z.literal(true),
})

export const ToolApprovalRequestSchema = z.object({
  requestId: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.string(),
})

export type ToolApprovalRequest = z.infer<typeof ToolApprovalRequestSchema>

export const ToolApprovalRespondInputSchema = z.object({
  requestId: z.string().min(1),
  approved: z.boolean(),
})

export const ToolApprovalRespondOutputSchema = z.object({
  responded: z.boolean(),
})
