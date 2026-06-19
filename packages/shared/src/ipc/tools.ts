import { z } from 'zod'

export const McpStatusListInputSchema = z.object({
  serverIds: z.array(z.string()),
  workingDirectory: z.string().optional(),
  environmentVariables: z.string().optional(),
})

export const McpStatusItemSchema = z.object({
  id: z.string(),
  connected: z.boolean(),
  reason: z.string().optional(),
  toolCount: z.number().int().nonnegative().optional(),
  serverName: z.string().optional(),
  serverVersion: z.string().optional(),
})

export const McpStatusListOutputSchema = z.object({
  items: z.array(McpStatusItemSchema),
})

export type McpStatusListInput = z.infer<typeof McpStatusListInputSchema>
export type McpStatusItem = z.infer<typeof McpStatusItemSchema>
export type McpStatusListOutput = z.infer<typeof McpStatusListOutputSchema>
