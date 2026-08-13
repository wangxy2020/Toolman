import { z } from 'zod'
import { UuidSchema } from './base.js'

export const AssistantLibSyllabusGenerateInputSchema = z.object({
  workspaceId: UuidSchema,
  sessionId: UuidSchema,
  modelId: z.string().min(1),
})

export const AssistantLibSyllabusGenerateOutputSchema = z.object({
  started: z.boolean(),
})

export const AssistantLibSyllabusStreamEventSchema = z.object({
  sessionId: z.string().min(1),
  generation: z.enum(['generating', 'ready', 'error']),
  generatedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  error: z.string().optional(),
})

export type AssistantLibSyllabusGenerateInput = z.infer<
  typeof AssistantLibSyllabusGenerateInputSchema
>
export type AssistantLibSyllabusStreamEvent = z.infer<
  typeof AssistantLibSyllabusStreamEventSchema
>
