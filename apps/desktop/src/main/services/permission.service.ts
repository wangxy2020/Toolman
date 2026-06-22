import { homedir } from 'node:os'

import { decodeMcpToolName } from './mcp-tool-utils'

export type ToolCategory = 'read' | 'write' | 'exec'

export type PermissionMode = 'normal' | 'plan' | 'auto-edit' | 'full-auto'

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  fs_glob: 'read',
  fs_grep: 'read',
  fs_read: 'read',
  fs_list: 'read',
  glob: 'read',
  grep: 'read',
  sql_query: 'read',
  sql_list_tables: 'read',
  http_fetch: 'read',
  browser_fetch: 'read',
  browser_open: 'read',
  browser_execute: 'read',
  browser_screenshot: 'read',
  github_request: 'read',
  fetch_html: 'read',
  fetch_markdown: 'read',
  fetch_txt: 'read',
  fetch_json: 'read',
  brave_web_search: 'read',
  brave_local_search: 'read',
  list_knowledges: 'read',
  search_knowledge: 'read',
  list_local_knowledges: 'read',
  search_local_knowledge: 'read',
  search_notes: 'read',
  read_note: 'read',
  hub_list: 'read',
  hub_invoke: 'read',
  python_execute: 'exec',
  memory_list: 'read',
  agent_task_list: 'read',
  fs_edit: 'write',
  fs_write: 'write',
  fs_delete: 'write',
  edit: 'write',
  memory_save: 'write',
  agent_task_create: 'write',
  agent_task_update: 'write',
  bash: 'exec',
}

const PREAUTH_TOOL_IDS = new Set(['bash'])

export interface ToolPermissionResult {
  allowed: boolean
  reason?: string
  requiresApproval?: boolean
}

export function parseEnvironmentVariables(raw?: string): Record<string, string> {
  if (!raw?.trim()) return {}

  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

export function resolveWorkingDirectory(path?: string): string {
  const candidate = path?.trim()
  if (candidate) return candidate
  return homedir()
}

function inferMcpToolCategory(toolName: string): ToolCategory {
  const lower = toolName.toLowerCase()
  if (
    lower.startsWith('read_') ||
    lower.startsWith('get_') ||
    lower.startsWith('search_') ||
    lower.startsWith('list_')
  ) {
    return 'read'
  }
  if (
    lower.includes('bash') ||
    lower.includes('shell') ||
    lower.includes('exec') ||
    lower.includes('run_command') ||
    lower.includes('terminal')
  ) {
    return 'exec'
  }
  if (
    lower.includes('write') ||
    lower.includes('edit') ||
    lower.includes('delete') ||
    lower.includes('create') ||
    lower.includes('update') ||
    lower.includes('replace') ||
    lower.includes('save') ||
    lower.includes('insert') ||
    lower.includes('comment') ||
    lower.includes('format') ||
    lower.includes('highlight') ||
    lower.includes('accept_') ||
    lower.includes('reject_') ||
    lower.includes('set_')
  ) {
    return 'write'
  }
  return 'read'
}

function resolveToolCategory(toolName: string): ToolCategory {
  if (TOOL_CATEGORIES[toolName]) return TOOL_CATEGORIES[toolName]
  const decoded = decodeMcpToolName(toolName)
  if (decoded) return inferMcpToolCategory(decoded.toolName)
  return 'read'
}

export function isDeleteTool(toolName: string): boolean {
  if (toolName === 'fs_delete') return true
  const decoded = decodeMcpToolName(toolName)
  const name = (decoded?.toolName ?? toolName).toLowerCase()
  return (
    name.includes('delete') ||
    name.includes('remove') ||
    name.includes('unlink') ||
    name.startsWith('rm_') ||
    name === 'rm'
  )
}

export function evaluateToolPermission(options: {
  toolName: string
  permissionMode: PermissionMode
  toolStates: Record<string, boolean>
  sqlStatement?: string
  autonomousMode?: boolean
}): ToolPermissionResult {
  const { toolName, toolStates, sqlStatement, autonomousMode } = options
  const permissionMode = options.permissionMode
  const category = resolveToolCategory(toolName)

  if (autonomousMode) {
    if (isDeleteTool(toolName)) {
      return {
        allowed: false,
        reason: `删除工具 ${toolName} 需要人工授权`,
        requiresApproval: true,
      }
    }
    return { allowed: true }
  }

  if (permissionMode === 'plan' && category !== 'read') {
    return { allowed: false, reason: '计划模式不允许编辑或执行命令', requiresApproval: false }
  }

  if (toolName === 'sql_query' && sqlStatement && !isReadOnlySql(sqlStatement)) {
    if (permissionMode !== 'full-auto') {
      return {
        allowed: false,
        reason: '仅全自动模式允许执行写入类 SQL',
        requiresApproval: permissionMode === 'normal' || permissionMode === 'auto-edit',
      }
    }
  }

  if (permissionMode === 'full-auto') {
    return { allowed: true }
  }

  if (PREAUTH_TOOL_IDS.has(toolName) && toolStates[toolName]) {
    return { allowed: true }
  }

  if (category === 'read') {
    return { allowed: true }
  }

  if (permissionMode === 'auto-edit' && category === 'write') {
    return { allowed: true }
  }

  if (category === 'write' || category === 'exec') {
    return {
      allowed: false,
      reason:
        category === 'exec'
          ? `执行工具 ${toolName} 需要人工授权、预授权或全自动权限模式`
          : `写入工具 ${toolName} 需要人工授权、预授权或自动编辑/全自动权限模式`,
      requiresApproval: true,
    }
  }

  return { allowed: false, reason: `工具 ${toolName} 未被允许`, requiresApproval: false }
}

/** @deprecated 使用 evaluateToolPermission */
export function canExecuteTool(options: {
  toolName: string
  permissionMode: PermissionMode
  toolStates: Record<string, boolean>
  sqlStatement?: string
}): { allowed: boolean; reason?: string } {
  const result = evaluateToolPermission(options)
  return { allowed: result.allowed, reason: result.reason }
}

function isReadOnlySql(sql: string): boolean {
  const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase()
  if (!normalized) return false
  const forbidden = /^(insert|update|delete|drop|alter|create|replace|pragma|attach|detach|vacuum|reindex)\b/
  if (forbidden.test(normalized)) return false
  return normalized.startsWith('select') || normalized.startsWith('with') || normalized.startsWith('pragma table_info')
}
