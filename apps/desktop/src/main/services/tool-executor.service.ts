import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { browserExecute, browserFetch, browserOpen, browserScreenshot } from './browser-cdp.service'
import { difyListKnowledges, difySearchKnowledge } from './dify-knowledge.service'
import {
  formatLocalKnowledgeList,
  listKnowledgeBasesForTool,
  resolveEffectiveKbIds,
  searchKnowledgeForTool,
} from './knowledge-document.service'
import { readNoteData, searchNotesData } from './notes-data.service'
import { getAssistantRow } from './assistant.service'
import { FilesystemSandbox } from './filesystem-sandbox.service'
import { BUILTIN_MCP_TOOL_DEFS } from './tool-registry'
import { getMcpServer } from './mcp-server-config.service'
import { listMcpServerTools } from './mcp-client-manager.service'
import { parseEnvironmentVariables } from './permission.service'
import { listMemories, saveMemory } from './memory.service'
import { decodeMcpToolName, encodeMcpToolName } from './mcp-tool-utils'
import { callMcpServerTool } from './mcp-client-manager.service'
import {
  createAgentTask,
  formatAgentTasks,
  listAgentTasks,
  updateAgentTask,
  type AgentTaskStatus,
} from './task-store.service'

const execFileAsync = promisify(execFile)

export interface ToolExecutionContext {
  workingDirectory?: string
  environmentVariables?: string
  workspaceId?: string
  assistantId?: string
  memoryEnabled?: boolean
  mcpServerIds?: string[]
}

function sandboxFor(context: ToolExecutionContext): FilesystemSandbox {
  return FilesystemSandbox.fromContext(context.workingDirectory)
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('工具参数不是合法 JSON')
  }
}

async function walkFiles(
  sandbox: FilesystemSandbox,
  root: string,
  matcher: (filePath: string) => boolean,
  results: string[],
) {
  if (results.length >= 200) return

  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (results.length >= 200) break
    if (sandbox.shouldSkipEntry(entry.name)) continue

    const fullPath = join(root, entry.name)
    if (!sandbox.isSafeDirectoryEntry(root, entry.name)) continue

    try {
      if (entry.isDirectory()) {
        const dirReal = realpathSync.native(fullPath)
        sandbox.validateRealPath(dirReal)
        await walkFiles(sandbox, dirReal, matcher, results)
        continue
      }

      const fileReal = realpathSync.native(fullPath)
      sandbox.validateRealPath(fileReal)
      if (entry.isFile() && matcher(fileReal)) {
        results.push(fileReal)
      }
    } catch {
      // skip unreadable or escaped paths
    }
  }
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/')
  if (normalized === '**' || normalized === '**/*' || normalized === '**/**') {
    return /^.*$/
  }

  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

async function executeFsGlob(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pattern = String(args.pattern ?? '')
  if (!pattern) throw new Error('缺少 pattern')

  const sandbox = sandboxFor(context)
  const cwd = args.path || args.cwd
    ? sandbox.resolveDirectory(String(args.path ?? args.cwd))
    : sandbox.rootReal
  const regex = globToRegExp(pattern.replace(/\\/g, '/'))
  const results: string[] = []

  await walkFiles(
    sandbox,
    cwd,
    (filePath) => regex.test(relative(cwd, filePath).replace(/\\/g, '/')),
    results,
  )

  if (!results.length) return '未找到匹配文件'
  const header =
    results.length >= 200 ? `找到至少 ${results.length} 个匹配文件（列表已截断）：\n` : `找到 ${results.length} 个匹配文件：\n`
  return header + results.join('\n')
}

async function executeFsGrep(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pattern = String(args.pattern ?? '')
  const pathArg = String(args.path ?? '.')
  if (!pattern) throw new Error('缺少 pattern')

  const sandbox = sandboxFor(context)
  const target = sandbox.resolveInside(pathArg)
  const ignoreCase = Boolean(args.ignoreCase)
  const regex = new RegExp(pattern, ignoreCase ? 'i' : undefined)
  const matches: string[] = []

  const scanFile = (filePath: string) => {
    const content = readFileSync(filePath, 'utf-8')
    content.split('\n').forEach((line, index) => {
      if (regex.test(line)) {
        matches.push(`${filePath}:${index + 1}:${line}`)
      }
    })
  }

  const stat = statSync(target)
  if (stat.isFile()) {
    scanFile(target)
  } else if (stat.isDirectory()) {
    const files: string[] = []
    await walkFiles(sandbox, target, () => true, files)
    for (const file of files) {
      if (matches.length >= 200) break
      try {
        scanFile(file)
      } catch {
        // skip unreadable files
      }
    }
  }

  return matches.length ? matches.slice(0, 200).join('\n') : '未找到匹配内容'
}

async function executeFsEdit(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pathArg = String(args.path ?? '')
  const oldText = String(args.oldText ?? '')
  const newText = String(args.newText ?? '')
  if (!pathArg || !oldText) throw new Error('缺少 path 或 oldText')

  const filePath = sandboxFor(context).resolveInside(pathArg)
  const content = readFileSync(filePath, 'utf-8')
  if (!content.includes(oldText)) {
    throw new Error('未在文件中找到要替换的文本')
  }
  writeFileSync(filePath, content.replace(oldText, newText), 'utf-8')
  return `已更新文件: ${filePath}`
}

function executeFsDelete(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pathArg = String(args.path ?? '')
  if (!pathArg) throw new Error('缺少 path')

  const filePath = sandboxFor(context).resolveInside(pathArg)
  const stat = statSync(filePath)
  if (stat.isDirectory()) {
    throw new Error('不支持删除目录，请指定文件路径')
  }
  unlinkSync(filePath)
  return `已删除文件: ${filePath}`
}

async function executeBash(args: Record<string, unknown>, context: ToolExecutionContext) {
  const command = String(args.command ?? '').trim()
  if (!command) throw new Error('缺少 command')

  const sandbox = sandboxFor(context)
  const cwd = args.cwd ? sandbox.resolveDirectory(String(args.cwd)) : sandbox.rootReal
  const env = {
    ...process.env,
    ...parseEnvironmentVariables(context.environmentVariables),
  }

  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
  const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]

  const { stdout, stderr } = await execFileAsync(shell, shellArgs, {
    cwd,
    env,
    maxBuffer: 1024 * 1024,
    timeout: 60_000,
  })

  const output = [stdout, stderr].filter(Boolean).join('\n').trim()
  return output || '(命令执行完成，无输出)'
}

function executeFsRead(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pathArg = String(args.path ?? '')
  if (!pathArg) throw new Error('缺少 path')

  const filePath = sandboxFor(context).resolveInside(pathArg)
  if (!statSync(filePath).isFile()) throw new Error('目标不是文件')

  const content = readFileSync(filePath, 'utf-8')
  if (content.length > 100_000) {
    return `${content.slice(0, 100_000)}\n...(已截断)`
  }
  return content
}

function executeFsWrite(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pathArg = String(args.path ?? '')
  const content = String(args.content ?? '')
  if (!pathArg) throw new Error('缺少 path')

  const sandbox = sandboxFor(context)
  const filePath = sandbox.resolveInside(pathArg)
  const parent = resolve(filePath, '..')
  if (existsSync(parent)) {
    sandbox.validateRealPath(realpathSync.native(parent))
  } else {
    sandbox.validateExistingOrParent(parent)
  }
  mkdirSync(parent, { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
  return `已写入文件: ${filePath}`
}

function executeFsList(args: Record<string, unknown>, context: ToolExecutionContext) {
  const sandbox = sandboxFor(context)
  const dirPath = args.path ? sandbox.resolveDirectory(String(args.path)) : sandbox.rootReal

  const entries = readdirSync(dirPath, { withFileTypes: true })
  return entries
    .filter((entry) => sandbox.isSafeDirectoryEntry(dirPath, entry.name))
    .map((entry) => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}`)
    .join('\n')
}

function openSqliteDatabase(databasePath: string, context: ToolExecutionContext) {
  const sandbox = sandboxFor(context)
  const resolved = isAbsolute(databasePath)
    ? sandbox.resolveInside(databasePath)
    : sandbox.resolveInside(databasePath)

  if (!existsSync(resolved)) {
    throw new Error(`数据库文件不存在: ${resolved}`)
  }

  return new Database(resolved, { readonly: true, fileMustExist: true })
}

function executeSqlListTables(args: Record<string, unknown>, context: ToolExecutionContext) {
  const database = String(args.database ?? '')
  if (!database) throw new Error('缺少 database')

  const db = openSqliteDatabase(database, context)
  try {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
    return rows.map((row) => row.name).join('\n') || '数据库中没有用户表'
  } finally {
    db.close()
  }
}

function executeSqlQuery(args: Record<string, unknown>, context: ToolExecutionContext) {
  const database = String(args.database ?? '')
  const sql = String(args.sql ?? '').trim()
  if (!database || !sql) throw new Error('缺少 database 或 sql')

  const db = openSqliteDatabase(database, context)
  try {
    const stmt = db.prepare(sql)
    if (stmt.reader) {
      return JSON.stringify(stmt.all(), null, 2)
    }
    const result = stmt.run()
    return JSON.stringify({
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    })
  } finally {
    db.close()
  }
}

async function executeHttpFetch(args: Record<string, unknown>) {
  const url = String(args.url ?? '')
  if (!url) throw new Error('缺少 url')

  const method = String(args.method ?? 'GET').toUpperCase()
  const response = await fetch(url, { method })
  const text = await response.text()
  const header = `HTTP ${response.status} ${response.statusText}\n`
  const body = text.length > 100_000 ? `${text.slice(0, 100_000)}\n...(已截断)` : text
  return `${header}\n${body}`
}

async function executeGithubRequest(args: Record<string, unknown>, context: ToolExecutionContext) {
  const path = String(args.path ?? '')
  if (!path) throw new Error('缺少 path')

  const env = {
    ...process.env,
    ...parseEnvironmentVariables(context.environmentVariables),
  }
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN
  if (!token) {
    throw new Error('未配置 GITHUB_TOKEN，请在智能体高级设置的环境变量中添加')
  }

  const method = String(args.method ?? 'GET').toUpperCase()
  const response = await fetch(`https://api.github.com${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: args.body ? String(args.body) : undefined,
  })

  return `HTTP ${response.status}\n${await response.text()}`
}

const LEGACY_FS_ALIASES: Record<string, string> = {
  glob: 'fs_glob',
  grep: 'fs_grep',
  edit: 'fs_edit',
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<string> | string

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  fs_glob: executeFsGlob,
  fs_grep: executeFsGrep,
  fs_edit: executeFsEdit,
  fs_delete: executeFsDelete,
  bash: executeBash,
  fs_read: executeFsRead,
  fs_write: executeFsWrite,
  fs_list: executeFsList,
  sql_list_tables: executeSqlListTables,
  sql_query: executeSqlQuery,
  http_fetch: (args) => executeHttpFetch(args),
  browser_open: (args) => browserOpen(args),
  browser_execute: (args) => browserExecute(args),
  browser_screenshot: (args) => browserScreenshot(args),
  browser_fetch: (args) => browserFetch(args),
  github_request: executeGithubRequest,
  list_knowledges: (_args, context) => difyListKnowledges(context.environmentVariables),
  search_knowledge: (args, context) => difySearchKnowledge(args, context.environmentVariables),
  list_local_knowledges: (_args, context) => executeListLocalKnowledges(context),
  search_local_knowledge: (args, context) => executeSearchLocalKnowledge(args, context),
  search_notes: (args) => executeSearchNotes(args),
  read_note: (args) => executeReadNote(args),
  hub_list: (args, context) => hubList(args, context.mcpServerIds ?? []),
  hub_invoke: (args, context) => hubInvoke(args, context, context.mcpServerIds ?? []),
  memory_save: (args, context) => executeMemorySave(args, context),
  memory_list: (_args, context) => executeMemoryList(context),
  agent_task_create: (args, context) => executeAgentTaskCreate(args, context),
  agent_task_update: (args, context) => executeAgentTaskUpdate(args, context),
  agent_task_list: (_args, context) => executeAgentTaskList(context),
}

export async function executeToolCall(
  toolName: string,
  argsJson: string,
  context: ToolExecutionContext,
): Promise<string> {
  const args = parseArgs(argsJson)
  const mcpTarget = decodeMcpToolName(toolName)
  if (mcpTarget) {
    return callMcpServerTool(mcpTarget.serverId, mcpTarget.toolName, args)
  }

  const resolvedName = LEGACY_FS_ALIASES[toolName] ?? toolName
  const handler = TOOL_HANDLERS[resolvedName]
  if (!handler) {
    throw new Error(`未知工具: ${toolName}`)
  }

  return handler(args, context)
}

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

async function hubList(args: Record<string, unknown>, mcpServerIds: string[]): Promise<string> {
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

async function hubInvoke(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  mcpServerIds: string[],
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

export function discoverLocalSqliteFiles(context: ToolExecutionContext): string[] {
  const sandbox = sandboxFor(context)
  const results: string[] = []

  const scan = (dir: string, depth: number) => {
    if (depth > 3 || results.length >= 20) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= 20) break
      if (sandbox.shouldSkipEntry(entry.name)) continue
      if (!sandbox.isSafeDirectoryEntry(dir, entry.name)) continue

      const fullPath = join(dir, entry.name)
      try {
        if (entry.isDirectory()) {
          scan(realpathSync.native(fullPath), depth + 1)
          continue
        }
        if (/\.(db|sqlite|sqlite3)$/i.test(entry.name)) {
          results.push(fullPath)
        }
      } catch {
        // skip
      }
    }
  }

  scan(sandbox.rootReal, 0)
  return results
}

export function getDefaultSqliteHint(context: ToolExecutionContext): string {
  const files = discoverLocalSqliteFiles(context)
  if (files.length === 0) {
    return `工作目录 ${sandboxFor(context).rootReal} 下未发现 .db/.sqlite 文件`
  }
  return files.map((file) => `- ${file}`).join('\n')
}

function executeMemorySave(args: Record<string, unknown>, context: ToolExecutionContext): Promise<string> {
  if (!context.memoryEnabled || !context.workspaceId) {
    return Promise.resolve('Error: 长期记忆未启用')
  }
  const content = String(args.content ?? '')
  return saveMemory(context.workspaceId, content, context.assistantId).then(
    (entry) => `已保存记忆：${entry.content}`,
  )
}

function executeMemoryList(context: ToolExecutionContext): string {
  if (!context.memoryEnabled || !context.workspaceId) {
    return 'Error: 长期记忆未启用'
  }
  const items = listMemories(context.workspaceId, { assistantId: context.assistantId })
  if (items.length === 0) return '暂无长期记忆。'
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n')
}

function executeListLocalKnowledges(context: ToolExecutionContext): string {
  if (!context.workspaceId) return 'Error: 未绑定工作区'
  return formatLocalKnowledgeList(listKnowledgeBasesForTool(context.workspaceId))
}

async function executeSearchLocalKnowledge(
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

function executeSearchNotes(args: Record<string, unknown>): string {
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

function executeReadNote(args: Record<string, unknown>): string {
  const noteId = String(args.noteId ?? '').trim()
  if (!noteId) return 'Error: noteId 不能为空'

  const result = readNoteData(noteId)
  if (!result) return `Error: 未找到笔记 ${noteId}`

  return result.markdown
}

function executeAgentTaskCreate(args: Record<string, unknown>, context: ToolExecutionContext): string {
  if (!context.assistantId) return 'Error: 未绑定智能体，无法创建任务'
  const task = createAgentTask(
    context.assistantId,
    String(args.title ?? ''),
    typeof args.notes === 'string' ? args.notes : undefined,
  )
  return `已创建任务：${task.title} (id: ${task.id})`
}

function executeAgentTaskUpdate(args: Record<string, unknown>, context: ToolExecutionContext): string {
  if (!context.assistantId) return 'Error: 未绑定智能体，无法更新任务'
  const status = args.status as AgentTaskStatus | undefined
  const task = updateAgentTask(context.assistantId, String(args.taskId ?? ''), {
    status,
    notes: typeof args.notes === 'string' ? args.notes : undefined,
  })
  return `已更新任务：${task.title} [${task.status}]`
}

function executeAgentTaskList(context: ToolExecutionContext): string {
  if (!context.assistantId) return 'Error: 未绑定智能体，无法列出任务'
  const tasks = listAgentTasks(context.assistantId)
  if (tasks.length === 0) return '当前没有任务。'
  return formatAgentTasks(context.assistantId)
}
