import type { AgentTask } from '@toolman/shared'

import { parseAssistantRuntime } from '../agent-runtime'
import { buildSkillsSystemHint } from '../agent-runtime.service'
import { getAssistantRow } from '../assistant.service'
import { ensureMcpServersConnected } from '../mcp-client-manager.service'
import { resolveToolDefinitions } from '../tool-registry/resolve'
import { logStructured } from '../structured-log.service'
import { resolveTaskToolWorkingDirectory } from './task-workspace.service'

export interface TaskToolRuntimeContext {
  mcpServerIds: string[]
  toolNames: string[]
  skillsHint: string | null
  workingDirectory: string
}

const toolNameCache = new Map<string, { names: string[]; preparedAt: number }>()
const CACHE_TTL_MS = 60_000

function resolveToolShortName(toolName: string): string {
  if (toolName.includes('__')) {
    return toolName.split('__').pop()?.toLowerCase() ?? toolName.toLowerCase()
  }
  return toolName.toLowerCase()
}

/** Align L2 tool surface with L1: connect MCP servers and resolve the same tool definitions. */
export async function prepareTaskToolRuntime(
  task: Pick<AgentTask, 'id' | 'assistantId' | 'workspaceId' | 'workspaceRoot'>,
): Promise<TaskToolRuntimeContext> {
  const assistant = task.assistantId ? getAssistantRow(task.assistantId) : null
  const runtime = parseAssistantRuntime(assistant, task.workspaceId)
  const workingDirectory = resolveTaskToolWorkingDirectory(task)

  try {
    await ensureMcpServersConnected(runtime.mcpServerIds)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logStructured('task-runtime', 'warn', `task MCP preconnect partial failure: taskId=${task.id} error=${message}`)
  }

  const definitions = await resolveToolDefinitions(runtime.mcpServerIds, {
    notesEnabled: true,
    autonomousMode: runtime.autonomousMode,
  })
  const toolNames = [...new Set(definitions.map((def) => def.function.name))].sort()

  toolNameCache.set(task.id, { names: toolNames, preparedAt: Date.now() })

  logStructured(
    'task-runtime',
    'info',
    `task tool runtime prepared: taskId=${task.id} tools=${toolNames.length} mcpServers=${runtime.mcpServerIds.length} wd=${workingDirectory}`,
  )

  return {
    mcpServerIds: runtime.mcpServerIds,
    toolNames,
    skillsHint: buildSkillsSystemHint(runtime.skillIds, { compact: true }),
    workingDirectory,
  }
}

export function getCachedPlannerToolNames(
  task: Pick<AgentTask, 'id' | 'assistantId' | 'workspaceId' | 'workspaceRoot'>,
): string[] | null {
  const cached = toolNameCache.get(task.id)
  if (!cached) return null
  if (Date.now() - cached.preparedAt > CACHE_TTL_MS) {
    toolNameCache.delete(task.id)
    return null
  }
  return cached.names
}

export function taskHasPlannerTool(
  task: Pick<AgentTask, 'id' | 'assistantId' | 'workspaceId' | 'workspaceRoot'>,
  toolName: string,
): boolean {
  const normalized = toolName.trim().toLowerCase()
  const names = getCachedPlannerToolNames(task) ?? []
  return names.some((name) => {
    const short = resolveToolShortName(name)
    return name === toolName || short === normalized || name.toLowerCase() === normalized
  })
}

export function taskHasExcelMcpTools(
  task: Pick<AgentTask, 'id' | 'assistantId' | 'workspaceId' | 'workspaceRoot'>,
): boolean {
  return taskHasPlannerTool(task, 'read_excel') || taskHasPlannerTool(task, 'review_excel')
}
