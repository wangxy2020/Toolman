import { difyListKnowledges, difySearchKnowledge } from '../dify-knowledge.service'
import {
  formatLocalKnowledgeList,
  listKnowledgeBasesForTool,
  resolveEffectiveKbIds,
  searchKnowledgeForTool,
} from '../knowledge-document.service'
import { readNoteData, searchNotesData } from '../notes-data.service'
import { getAssistantRow } from '../assistant.service'
import { BUILTIN_MCP_TOOL_DEFS } from '../tool-registry'
import { getMcpServer } from '../mcp-server-config.service'
import { listMcpServerTools } from '../mcp-client-manager.service'
import { listMemories, saveMemory } from '../memory.service'
import { encodeMcpToolName } from '../mcp-tool-utils'
import {
  createAgentTask,
  formatAgentTasks,
  listAgentTasks,
  updateAgentTask,
  type AgentTaskStatus,
} from '../task-store.service'
import type { ToolExecutionContext } from './types'

interface HubToolEntry {
  id: string
  serverId: string
  serverName: string
  toolName: string
  description?: string
}

async function collectHubTools(mcpServerIds: string[]): Promise<HubToolEntry[]> {
  const entries: HubToolEntry[] = []

  for (const serverId of mcpServerIds) {
    if (serverId === 'hub') continue
    const config = getMcpServer(serverId)
    if (!config?.enabled) continue

    if (config.type === 'builtin') {
      const builtinId = config.builtinId ?? serverId
      for (const tool of BUILTIN_MCP_TOOL_DEFS[builtinId] ?? []) {
        entries.push({
          id: tool.function.name,
          serverId,
          serverName: config.name,
          toolName: tool.function.name,
          description: tool.function.description,
        })
      }
    }
  }

  const remote = await listMcpServerTools(mcpServerIds.filter((id) => id !== 'hub'))
  for (const item of remote.items) {
    const config = getMcpServer(item.serverId)
    entries.push({
      id: encodeMcpToolName(item.serverId, item.name),
      serverId: item.serverId,
      serverName: config?.name ?? item.serverId,
      toolName: item.name,
      description: item.description,
    })
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id))
}

export async function hubList(args: Record<string, unknown>, mcpServerIds: string[]): Promise<string> {
  const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100)
  const offset = Math.max(Number(args.offset) || 0, 0)

  const tools = await collectHubTools(mcpServerIds)
  const slice = tools.slice(offset, offset + limit)

  if (slice.length === 0) return '当前没有可用的 MCP 工具。'

  const lines = slice.map(
    (tool) =>
      `- ${tool.id} (${tool.serverName}/${tool.toolName})${tool.description ? `: ${tool.description}` : ''}`,
  )

  const header = `共 ${tools.length} 个工具，显示 ${offset + 1}-${offset + slice.length}:`
  return `${header}\n\n${lines.join('\n')}`
}

export async function hubInvoke(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  mcpServerIds: string[],
  executeToolCall: (
    toolName: string,
    argsJson: string,
    context: ToolExecutionContext,
  ) => Promise<string>,
): Promise<string> {
  const name = String(args.name ?? '').trim()
  if (!name) throw new Error('缺少 name')

  const tools = await collectHubTools(mcpServerIds)
  const tool =
    tools.find((item) => item.id === name) ??
    tools.find((item) => item.toolName === name) ??
    tools.find((item) => `${item.serverId}__${item.toolName}` === name)

  if (!tool) {
    throw new Error(`未找到工具: ${name}，请先调用 hub_list 查看可用工具`)
  }

  const params =
    args.params && typeof args.params === 'object'
      ? (args.params as Record<string, unknown>)
      : {}

  return executeToolCall(tool.id, JSON.stringify(params), {
    ...context,
    mcpServerIds,
  })
}

export function executeMemorySave(args: Record<string, unknown>, context: ToolExecutionContext): Promise<string> {
  if (!context.memoryEnabled || !context.workspaceId) {
    return Promise.resolve('Error: 长期记忆未启用')
  }
  const content = String(args.content ?? '')
  return saveMemory(context.workspaceId, content, context.assistantId).then(
    (entry) => `已保存记忆：${entry.content}`,
  )
}

export function executeMemoryList(context: ToolExecutionContext): string {
  if (!context.memoryEnabled || !context.workspaceId) {
    return 'Error: 长期记忆未启用'
  }
  const items = listMemories(context.workspaceId, { assistantId: context.assistantId })
  if (items.length === 0) return '暂无长期记忆。'
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n')
}

export function executeListLocalKnowledges(context: ToolExecutionContext): string {
  if (!context.workspaceId) return 'Error: 未绑定工作区'
  return formatLocalKnowledgeList(listKnowledgeBasesForTool(context.workspaceId))
}

export async function executeSearchLocalKnowledge(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<string> {
  if (!context.workspaceId) return 'Error: 未绑定工作区'
  const query = String(args.query ?? '').trim()
  if (!query) return 'Error: query 不能为空'

  const kbIdArg = typeof args.kbId === 'string' && args.kbId.trim() ? args.kbId.trim() : undefined
  const topK = typeof args.topK === 'number' ? args.topK : 6
  const assistant = context.assistantId ? getAssistantRow(context.assistantId) : null
  const assistantParams = assistant
    ? (JSON.parse(assistant.parametersJson) as Record<string, unknown>)
    : {}
  const effectiveKbIds = kbIdArg
    ? [kbIdArg]
    : resolveEffectiveKbIds({
        workspaceId: context.workspaceId,
        assistant,
      })

  if (effectiveKbIds.length === 0) {
    return '当前没有可检索的知识库。请在智能体设置中绑定知识库，或创建知识库后再试。'
  }

  const results = await searchKnowledgeForTool({
    workspaceId: context.workspaceId,
    query,
    kbIds: effectiveKbIds,
    topK: typeof assistantParams.kbTopK === 'number' ? assistantParams.kbTopK : topK,
    scoreThreshold: assistantParams.kbScoreThreshold as number | undefined,
    kbSettings: assistantParams.kbSettings as
      | Record<string, { topK?: number; scoreThreshold?: number }>
      | undefined,
  })

  if (results.length === 0) return '未找到相关内容。'

  return results
    .map(
      (item, index) =>
        `${index + 1}. [${item.kbName}] ${item.documentTitle} (${(item.score * 100).toFixed(1)}%)\n${item.text.trim()}`,
    )
    .join('\n\n')
}

export function executeSearchNotes(args: Record<string, unknown>): string {
  const query = String(args.query ?? '').trim()
  if (!query) return 'Error: query 不能为空'

  const tag = typeof args.tag === 'string' ? args.tag : undefined
  const notebookId = typeof args.notebookId === 'string' ? args.notebookId : undefined
  const limit = typeof args.limit === 'number' ? args.limit : 10

  const results = searchNotesData(query, { tag, notebookId, limit })
  if (results.length === 0) return '未找到匹配的笔记。'

  return results
    .map(
      (item, index) =>
        `${index + 1}. ${item.title} (id: ${item.noteId}, notebook: ${item.notebookId}${item.tags.length ? `, tags: ${item.tags.join(', ')}` : ''})\n${item.snippet}`,
    )
    .join('\n\n')
}

export function executeReadNote(args: Record<string, unknown>): string {
  const noteId = String(args.noteId ?? '').trim()
  if (!noteId) return 'Error: noteId 不能为空'

  const result = readNoteData(noteId)
  if (!result) return `Error: 未找到笔记 ${noteId}`

  return result.markdown
}

export function executeAgentTaskCreate(args: Record<string, unknown>, context: ToolExecutionContext): string {
  if (!context.assistantId) return 'Error: 未绑定智能体，无法创建任务'
  const task = createAgentTask(
    context.assistantId,
    String(args.title ?? ''),
    typeof args.notes === 'string' ? args.notes : undefined,
  )
  return `已创建任务：${task.title} (id: ${task.id})`
}

export function executeAgentTaskUpdate(args: Record<string, unknown>, context: ToolExecutionContext): string {
  if (!context.assistantId) return 'Error: 未绑定智能体，无法更新任务'
  const status = args.status as AgentTaskStatus | undefined
  const task = updateAgentTask(context.assistantId, String(args.taskId ?? ''), {
    status,
    notes: typeof args.notes === 'string' ? args.notes : undefined,
  })
  return `已更新任务：${task.title} [${task.status}]`
}

export function executeAgentTaskList(context: ToolExecutionContext): string {
  if (!context.assistantId) return 'Error: 未绑定智能体，无法列出任务'
  const tasks = listAgentTasks(context.assistantId)
  if (tasks.length === 0) return '当前没有任务。'
  return formatAgentTasks(context.assistantId)
}

export { difyListKnowledges, difySearchKnowledge }
