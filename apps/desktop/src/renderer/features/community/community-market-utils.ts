import type { AppLanguage } from '../settings/app-settings'
import { getDateLocale } from '../../i18n/date-locale'

export function formatCommunityCount(value: number): string {
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1)}万`
  }
  return String(value)
}

export function formatCommunityDate(timestamp: number, language: AppLanguage = 'zh-CN'): string {
  return new Date(timestamp).toLocaleDateString(getDateLocale(language), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export interface McpManifestPreview {
  mcpId: string | null
  transport: string | null
  command: string | null
  tools: Array<{ name: string; description?: string }>
}

export function parseMcpManifestPreview(
  manifest: Record<string, unknown> | undefined,
): McpManifestPreview | null {
  if (!manifest) return null

  const tools = Array.isArray(manifest.tools)
    ? manifest.tools.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const name = 'name' in item && typeof item.name === 'string' ? item.name : null
        if (!name) return []
        const description =
          'description' in item && typeof item.description === 'string'
            ? item.description
            : undefined
        return [{ name, description }]
      })
    : []

  return {
    mcpId: typeof manifest.mcpId === 'string' ? manifest.mcpId : null,
    transport: typeof manifest.transport === 'string' ? manifest.transport : null,
    command: typeof manifest.command === 'string' ? manifest.command : null,
    tools,
  }
}

export interface SkillManifestPreview {
  skillId: string | null
  name: string | null
  description: string | null
  includesPrompt: boolean
  files: string[]
}

export function parseSkillManifestPreview(
  manifest: Record<string, unknown> | undefined,
): SkillManifestPreview | null {
  if (!manifest) return null

  const files = Array.isArray(manifest.files)
    ? manifest.files.filter((item): item is string => typeof item === 'string')
    : []

  return {
    skillId: typeof manifest.skillId === 'string' ? manifest.skillId : null,
    name: typeof manifest.name === 'string' ? manifest.name : null,
    description: typeof manifest.description === 'string' ? manifest.description : null,
    includesPrompt: manifest.includesPrompt === true,
    files,
  }
}

export interface WorkflowManifestPreview {
  workflowId: string | null
  engine: string | null
  graphPath: string | null
  requiredMcpIds: string[]
  requiredSkillIds: string[]
  nodeCount: number | null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function readWorkflowNodeCount(graph: unknown): number | null {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return null
  const object = graph as Record<string, unknown>
  if (Array.isArray(object.nodes)) return object.nodes.length
  if (
    object.graph &&
    typeof object.graph === 'object' &&
    !Array.isArray(object.graph) &&
    Array.isArray((object.graph as Record<string, unknown>).nodes)
  ) {
    return ((object.graph as Record<string, unknown>).nodes as unknown[]).length
  }
  return null
}

export function parseWorkflowManifestPreview(
  manifest: Record<string, unknown> | undefined,
): WorkflowManifestPreview | null {
  if (!manifest) return null

  const graph = manifest.graph
  const nodeCount = readWorkflowNodeCount(graph)

  return {
    workflowId: typeof manifest.workflowId === 'string' ? manifest.workflowId : null,
    engine: typeof manifest.engine === 'string' ? manifest.engine : null,
    graphPath: typeof manifest.graphPath === 'string' ? manifest.graphPath : null,
    requiredMcpIds: readStringArray(manifest.requiredMcpIds),
    requiredSkillIds: readStringArray(manifest.requiredSkillIds),
    nodeCount,
  }
}
