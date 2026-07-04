import { isAbsolute, relative, resolve } from 'node:path'

import { getDefaultMcpServerIds } from '@toolman/shared'

import { encodeMcpToolName } from '../../mcp-tool-utils'
import { getAssistantRow } from '../../assistant.service'
import { parseAssistantRuntime } from '../../agent-runtime'
import { buildSkillsSystemHint } from '../../agent-runtime.service'
import { getMcpServer } from '../../mcp-server-config.service'
import { getMcpClientState } from '../../mcp-client-manager.service'
import { BUILTIN_MCP_TOOL_DEFS } from '../../tool-registry/builtin-mcp-defs'
import { resolveTaskToolWorkingDirectory } from '../task-workspace.service'
import { getCachedPlannerToolNames } from '../task-runtime-tool-context'
import type { AgentTask } from '@toolman/shared'

const CORE_PLANNER_TOOLS = [
  'fs_list',
  'fs_read',
  'fs_write',
  'fs_edit',
  'fs_glob',
  'fs_grep',
  'fs_delete',
  'bash',
  'sql_query',
  'sql_list_tables',
  'http_fetch',
] as const

const OPTIONAL_PLANNER_TOOLS = ['agent_task_list'] as const

const REMOTE_SERVER_PLANNER_TOOLS: Record<string, string[]> = {
  'excel-mcp-server': [
    'read_excel',
    'review_excel',
    'modify_excel_cells',
    'highlight_excel_cells',
  ],
  'brave-search': ['brave_web_search', 'brave_local_search'],
}

const TOOL_NAME_ALIASES: Record<string, string> = {
  web_search: 'brave_web_search',
  create_file: 'fs_write',
  write_file: 'fs_write',
  read_file: 'fs_read',
  list_files: 'fs_list',
  list_dir: 'fs_list',
  glob: 'fs_glob',
  grep: 'fs_grep',
  read_excel: encodeMcpToolName('excel-mcp-server', 'read_excel'),
  review_excel: encodeMcpToolName('excel-mcp-server', 'review_excel'),
  modify_excel_cells: encodeMcpToolName('excel-mcp-server', 'modify_excel_cells'),
}

const PATH_ARG_KEYS = ['path', 'filePath', 'file_path', 'cwd', 'directory', 'dir'] as const

function parseToolArgs(argsJson: string): Record<string, unknown> {
  return JSON.parse(argsJson) as Record<string, unknown>
}

function stringifyToolArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args)
}

function addToolName(names: Set<string>, toolName: string): void {
  const trimmed = toolName.trim()
  if (!trimmed) return
  names.add(trimmed)
}

function addRemoteServerPlannerTools(names: Set<string>, serverId: string): void {
  const known = REMOTE_SERVER_PLANNER_TOOLS[serverId]
  if (!known) return
  for (const toolName of known) {
    addToolName(names, encodeMcpToolName(serverId, toolName))
  }
}

export function listPlannerToolNamesForTask(
  task: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>,
): string[] {
  const cached = getCachedPlannerToolNames(task)
  if (cached && cached.length > 0) {
    return cached
  }

  const names = new Set<string>()
  const assistant = task.assistantId ? getAssistantRow(task.assistantId) : null
  const runtime = parseAssistantRuntime(assistant, task.workspaceId)
  const serverIds =
    runtime.mcpServerIds.length > 0 ? runtime.mcpServerIds : [...getDefaultMcpServerIds()]

  let hasFilesystemTools = false

  for (const serverId of serverIds) {
    const config = getMcpServer(serverId)
    if (!config?.enabled) continue

    if (config.type === 'builtin') {
      const builtinId = config.builtinId ?? serverId
      const defs = BUILTIN_MCP_TOOL_DEFS[builtinId] ?? []
      for (const def of defs) {
        addToolName(names, def.function.name)
      }
      if (builtinId === 'filesystem') {
        hasFilesystemTools = true
      }
      continue
    }

    if (config.type === 'stdio' || config.type === 'sse' || config.type === 'streamableHttp') {
      const active = getMcpClientState(serverId)
      if (!active?.connected) continue
      addRemoteServerPlannerTools(names, serverId)
    }
  }

  if (hasFilesystemTools || names.size === 0) {
    for (const toolName of CORE_PLANNER_TOOLS) {
      addToolName(names, toolName)
    }
  }

  for (const toolName of OPTIONAL_PLANNER_TOOLS) {
    addToolName(names, toolName)
  }

  return [...names].sort()
}

export function normalizePlannerToolName(toolName: string): string {
  const trimmed = toolName.trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()
  if (TOOL_NAME_ALIASES[lower]) {
    return TOOL_NAME_ALIASES[lower]
  }
  if (trimmed.startsWith('mcp__')) {
    return trimmed
  }
  return trimmed
}

function normalizePlannerPathArg(value: string, workingDirectory: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.') return trimmed

  const wd = resolve(workingDirectory)
  if (isAbsolute(trimmed)) {
    const rel = relative(wd, resolve(trimmed))
    if (!rel.startsWith('..') && !isAbsolute(rel)) {
      return rel || '.'
    }
    if (trimmed.match(/^\/[^/]+$/)) {
      return trimmed.slice(1)
    }
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    return trimmed.replace(/^\/+/, '')
  }

  return trimmed
}

export function normalizePlannerToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  workingDirectory: string,
): Record<string, unknown> {
  const next = { ...args }
  const shortName = toolName.includes('__') ? (toolName.split('__').pop() ?? toolName) : toolName

  for (const key of PATH_ARG_KEYS) {
    const raw = next[key]
    if (typeof raw !== 'string') continue
    next[key] = normalizePlannerPathArg(raw, workingDirectory)
  }

  if (shortName === 'fs_write' || shortName === 'write_file' || toolName === 'create_file') {
    if (typeof next.path !== 'string' && typeof next.filePath === 'string') {
      next.path = next.filePath
      delete next.filePath
    }
    if (typeof next.content !== 'string' && typeof next.text === 'string') {
      next.content = next.text
      delete next.text
    }
  }

  if (shortName === 'read_excel' || shortName === 'review_excel') {
    if (typeof next.filePath !== 'string' && typeof next.path === 'string') {
      next.filePath = normalizePlannerPathArg(String(next.path), workingDirectory)
      delete next.path
    } else if (typeof next.filePath === 'string') {
      next.filePath = normalizePlannerPathArg(next.filePath, workingDirectory)
    }
  }

  return next
}

export function buildPlannerAvailableToolsHint(task: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>): string {
  const allowedTools = listPlannerToolNamesForTask(task)
  const workingDirectory = resolveTaskToolWorkingDirectory(task)
  const assistant = task.assistantId ? getAssistantRow(task.assistantId) : null
  const runtime = parseAssistantRuntime(assistant, task.workspaceId)
  const skillsHint = buildSkillsSystemHint(runtime.skillIds, { compact: true })
  const hasExcelMcp = allowedTools.some((name) => /read_excel|review_excel/i.test(name))

  return [
    '允许的工具名（禁止使用未列出的名称，如 web_search、create_file）：',
    allowedTools.map((item) => `- ${item}`).join('\n'),
    `智能体工作目录：${workingDirectory}`,
    ...(skillsHint ? [`已挂载技能：\n${skillsHint}`] : []),
    '输出文件请保存到智能体工作目录或其子目录（用户可见），不要写入 .toolman/tasks 等内部目录。',
    hasExcelMcp
      ? 'Excel 统计/价格表类任务：优先用 mcp__excel-mcp-server__read_excel 读取数据，再用 fs_write 写 summary_report.csv；不要用手写 bash/openpyxl 替代 MCP。'
      : '目录表任务请用单步 bash 自包含完成；若拆成 fs_list + fs_write，write 的 content 可写表头或使用 {{PREV_STEP_OUTPUT}} 占位，执行器会自动注入上一步结果。',
    '路径参数请使用相对路径（如 "."、"子目录名"、"IPC_Payment_data/xxx.xlsx"），不要写 /test 这类根路径。',
  ].join('\n')
}

export function normalizePlannerToolStep(
  toolName: string,
  argsJson: string,
  task: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>,
): { toolName: string; argsJson: string } {
  const normalizedName = normalizePlannerToolName(toolName)
  const workingDirectory = resolveTaskToolWorkingDirectory(task)
  let args: Record<string, unknown>
  try {
    args = parseToolArgs(argsJson)
  } catch {
    throw new Error(`工具 ${toolName} 的参数不是合法 JSON`)
  }

  const normalizedArgs = normalizePlannerToolArgs(normalizedName, args, workingDirectory)
  return {
    toolName: normalizedName,
    argsJson: stringifyToolArgs(normalizedArgs),
  }
}

export function isUnsupportedPlannerTool(
  toolName: string,
  task?: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>,
): boolean {
  const normalized = normalizePlannerToolName(toolName)
  if (task) {
    const allowed = new Set(listPlannerToolNamesForTask(task))
    return !allowed.has(normalized)
  }

  if (normalized.startsWith('mcp__')) return false
  if ([...CORE_PLANNER_TOOLS, ...OPTIONAL_PLANNER_TOOLS].includes(normalized as (typeof CORE_PLANNER_TOOLS)[number])) {
    return false
  }
  if (normalized === 'brave_web_search' || normalized === 'brave_local_search') return false
  return true
}
