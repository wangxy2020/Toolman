import { z } from 'zod'

export const McpServerTypeSchema = z.enum(['builtin', 'stdio', 'sse', 'streamableHttp'])

export const McpPackageSourceSchema = z.enum(['default', 'taobao', 'custom'])

export const McpServerConfigSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  description: z.string().max(256).optional(),
  type: McpServerTypeSchema,
  enabled: z.boolean().default(true),
  command: z.string().max(512).optional(),
  url: z.string().max(2048).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().max(1024).optional(),
  builtinId: z.string().optional(),
  packageSource: McpPackageSourceSchema.optional(),
  longRunning: z.boolean().optional(),
  timeoutSeconds: z.number().int().positive().max(3600).optional(),
  provider: z.string().max(128).optional(),
  providerUrl: z.string().max(512).optional(),
  logoUrl: z.string().max(512).optional(),
  tags: z.array(z.string()).optional(),
  dbHost: z.string().max(256).optional(),
  dbPort: z.string().max(16).optional(),
  dbUser: z.string().max(128).optional(),
  dbPassword: z.string().max(256).optional(),
  dbName: z.string().max(128).optional(),
})

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>

export const McpServerListOutputSchema = z.object({
  items: z.array(McpServerConfigSchema),
})

export const McpServerUpsertInputSchema = McpServerConfigSchema

export const McpServerDeleteInputSchema = z.object({
  id: z.string().min(1).max(64),
})

export const McpServerDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})

export const McpServerTestInputSchema = z.object({
  id: z.string().min(1).max(64),
})

export const McpServerTestOutputSchema = z.object({
  success: z.boolean(),
  toolCount: z.number().int().nonnegative().optional(),
  serverName: z.string().optional(),
  serverVersion: z.string().optional(),
  error: z.string().optional(),
})

export const McpToolInfoSchema = z.object({
  serverId: z.string(),
  name: z.string(),
  description: z.string().optional(),
})

export type McpToolInfo = z.infer<typeof McpToolInfoSchema>

export const McpToolsListInputSchema = z.object({
  serverIds: z.array(z.string()),
})

export const McpToolsListOutputSchema = z.object({
  items: z.array(McpToolInfoSchema),
})

export const McpPromptInfoSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
})

export type McpPromptInfo = z.infer<typeof McpPromptInfoSchema>

export const McpResourceInfoSchema = z.object({
  name: z.string(),
  uri: z.string(),
  description: z.string().optional(),
})

export type McpResourceInfo = z.infer<typeof McpResourceInfoSchema>

export const McpServerInspectInputSchema = z.object({
  id: z.string().min(1).max(64),
})

export const McpServerInspectOutputSchema = z.object({
  tools: z.array(McpToolInfoSchema),
  prompts: z.array(McpPromptInfoSchema),
  resources: z.array(McpResourceInfoSchema),
})
