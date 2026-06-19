import { z } from 'zod'

import { McpServerConfigSchema, type McpServerConfig } from '@toolman/shared'

const McpToolManifestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
})

const McpTemplateSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.unknown()).optional(),
})

export const McpMarketManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  mcpId: z.string().min(1),
  transport: z.enum(['stdio', 'sse', 'streamableHttp']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.unknown()).optional(),
  tools: z.array(McpToolManifestSchema).optional(),
  templates: z.array(McpTemplateSchema).optional(),
  configSchema: z.record(z.unknown()).optional(),
})

export type McpMarketManifest = z.infer<typeof McpMarketManifestSchema>

export interface McpMarketInstallInput {
  manifest: Record<string, unknown>
  packagePath: string
  resourceId: string
  resourceTitle?: string
}

function slugifyMcpId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'mcp'
}

export function buildCommunityMcpServerId(mcpId: string): string {
  return `community-${slugifyMcpId(mcpId)}`
}

function pickTemplateConfig(manifest: McpMarketManifest): Record<string, unknown> {
  const templates = manifest.templates ?? []
  const preferred =
    templates.find((item) => item.name === 'default') ??
    templates[0]
  return preferred?.config ?? {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string')
  return items.length > 0 ? items : undefined
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    if (typeof nested === 'string') return [[key, nested] as const]
    if (typeof nested === 'number' || typeof nested === 'boolean') {
      return [[key, String(nested)] as const]
    }
    return []
  })
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function humanizeMcpId(mcpId: string): string {
  return mcpId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function manifestToMcpServerConfig(input: McpMarketInstallInput): McpServerConfig {
  const manifest = McpMarketManifestSchema.parse(input.manifest)
  const templateConfig = pickTemplateConfig(manifest)

  const transport = manifest.transport
  const command =
    readString(templateConfig.command) ??
    manifest.command?.trim() ??
    (transport === 'stdio' ? undefined : 'http')

  const url =
    readString(templateConfig.url) ??
    readString(templateConfig.endpoint) ??
    readString(templateConfig.serverUrl)

  const args = readStringArray(templateConfig.args) ?? manifest.args ?? []
  const env = {
    ...readStringRecord(manifest.env),
    ...readStringRecord(templateConfig.env),
  }

  const cwd = readString(templateConfig.cwd) ?? input.packagePath
  const longRunning =
    typeof templateConfig.longRunning === 'boolean' ? templateConfig.longRunning : transport !== 'stdio'
  const timeoutSeconds =
    typeof templateConfig.timeoutSeconds === 'number' && templateConfig.timeoutSeconds > 0
      ? Math.floor(templateConfig.timeoutSeconds)
      : undefined

  const config = McpServerConfigSchema.parse({
    id: buildCommunityMcpServerId(manifest.mcpId),
    name: input.resourceTitle?.trim() || humanizeMcpId(manifest.mcpId),
    description:
      manifest.tools && manifest.tools.length > 0
        ? `Community MCP · ${manifest.tools.length} tools`
        : 'Installed from Community Hub',
    type: transport,
    enabled: true,
    command,
    url,
    args,
    env: Object.keys(env).length > 0 ? env : undefined,
    cwd,
    packageSource: 'default',
    longRunning,
    timeoutSeconds,
    tags: ['community', input.resourceId],
  })

  if (transport === 'stdio' && !config.command?.trim()) {
    throw new Error('MCP manifest is missing command for stdio transport')
  }

  if ((transport === 'sse' || transport === 'streamableHttp') && !config.url?.trim()) {
    throw new Error('MCP manifest is missing url for HTTP transport')
  }

  return config
}
