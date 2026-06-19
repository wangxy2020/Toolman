import { z } from 'zod'
import { TimestampSchema } from '../ipc/base.js'

export const AgentPackageAssistantSchema = z.object({
  name: z.string().min(1),
  systemPrompt: z.string(),
  modelId: z.string().optional(),
  parameters: z.record(z.unknown()).default({}),
  mcpServers: z.array(z.unknown()).default([]),
  toolIds: z.array(z.string()).default([]),
  knowledgeRefs: z.array(z.string()).default([]),
})

export const AgentPackageSchema = z.object({
  version: z.literal(1),
  exportedAt: TimestampSchema,
  assistant: AgentPackageAssistantSchema,
  workflow: z.unknown().nullable().optional(),
})

export type AgentPackage = z.infer<typeof AgentPackageSchema>
