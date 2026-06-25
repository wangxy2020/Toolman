import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import {McpStatusListInputSchema, type McpStatusItem, toErrorMessage } from '@toolman/shared'
import {
  discoverLocalSqliteFiles,
  getDefaultSqliteHint,
  type ToolExecutionContext,
} from './tool-executor.service'
import { parseEnvironmentVariables, resolveWorkingDirectory } from './permission.service'
import { getMcpServer } from './mcp-server-config.service'
import {
  connectMcpServer,
  disconnectMcpServer,
  getMcpClientState,
} from './mcp-client-manager.service'
import { isPostgresMcpConfig } from './mcp-postgres-verify.service'

function checkBuiltinFilesystem(context: ToolExecutionContext): McpStatusItem {
  const dir = resolveWorkingDirectory(context.workingDirectory)
  if (!existsSync(dir)) {
    return { id: 'filesystem', connected: false, reason: `工作目录不存在: ${dir}` }
  }
  if (!statSync(dir).isDirectory()) {
    return { id: 'filesystem', connected: false, reason: '工作目录不是文件夹' }
  }
  return { id: 'filesystem', connected: true, reason: '内置文件系统工具（含 read/write/edit/delete/list/glob/grep）' }
}

function checkBuiltinSqlite(context: ToolExecutionContext): McpStatusItem {
  try {
    const files = discoverLocalSqliteFiles(context)
    if (files.length > 0) {
      return { id: 'sqlite', connected: true, reason: `发现 ${files.length} 个本地数据库` }
    }
    return {
      id: 'sqlite',
      connected: true,
      reason: '可访问本地 SQLite，请在工作目录放置 .db/.sqlite 文件',
    }
  } catch (error) {
    return {
      id: 'sqlite',
      connected: false,
      reason: toErrorMessage(error, 'SQLite 不可用'),
    }
  }
}

function checkBuiltinBrowser(): McpStatusItem {
  return { id: 'browser', connected: true, reason: '内置 CDP 浏览器工具（open/execute/screenshot/fetch）' }
}

function checkBuiltinGithub(context: ToolExecutionContext): McpStatusItem {
  const env = {
    ...process.env,
    ...parseEnvironmentVariables(context.environmentVariables),
  }
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN
  if (!token) {
    return {
      id: 'github',
      connected: false,
      reason: '请在环境变量中配置 GITHUB_TOKEN',
    }
  }
  return { id: 'github', connected: true, reason: '内置 GitHub API 工具' }
}

function checkBuiltinDify(context: ToolExecutionContext): McpStatusItem {
  const server = getMcpServer('dify')
  const env = {
    ...process.env,
    ...parseEnvironmentVariables(context.environmentVariables),
    ...(server?.env ?? {}),
  }
  if (!env.DIFY_KEY?.trim() && !env.DIFY_API_KEY?.trim()) {
    return { id: 'dify', connected: false, reason: '请在 MCP 设置中配置 DIFY_KEY' }
  }
  if (!server?.providerUrl?.trim() && !env.DIFY_API_HOST?.trim()) {
    return { id: 'dify', connected: false, reason: '请在 MCP 设置中配置 Dify API 地址' }
  }
  return { id: 'dify', connected: true, reason: '内置 Dify 知识库工具' }
}

function checkBuiltinHub(): McpStatusItem {
  return { id: 'hub', connected: true, reason: '内置 Hub 工具聚合器（list/invoke）' }
}

const BUILTIN_CHECKS: Record<string, (ctx: ToolExecutionContext) => McpStatusItem> = {
  filesystem: checkBuiltinFilesystem,
  sqlite: checkBuiltinSqlite,
  browser: () => checkBuiltinBrowser(),
  github: checkBuiltinGithub,
  dify: checkBuiltinDify,
  hub: () => checkBuiltinHub(),
}

async function checkRemoteServer(serverId: string): Promise<McpStatusItem> {
  const config = getMcpServer(serverId)
  if (!config) {
    return { id: serverId, connected: false, reason: '服务器不存在' }
  }
  if (!config.enabled) {
    return { id: serverId, connected: false, reason: '未启用' }
  }

  if (isPostgresMcpConfig(config)) {
    try {
      await disconnectMcpServer(serverId)
      const active = await connectMcpServer(serverId)
      return {
        id: serverId,
        connected: true,
        reason: `已连接数据库，${active.toolCount} 个工具`,
        toolCount: active.toolCount,
        serverName: active.serverName,
        serverVersion: active.serverVersion,
      }
    } catch (error) {
      const message = toErrorMessage(error, '数据库连接失败')
      const failed = getMcpClientState(serverId)
      return {
        id: serverId,
        connected: false,
        reason: failed?.lastError ?? message,
      }
    }
  }

  const cached = getMcpClientState(serverId)
  if (cached?.connected) {
    return {
      id: serverId,
      connected: true,
      reason: `已连接 ${cached.toolCount} 个工具`,
      toolCount: cached.toolCount,
      serverName: cached.serverName,
      serverVersion: cached.serverVersion,
    }
  }

  try {
    const active = await connectMcpServer(serverId)
    return {
      id: serverId,
      connected: true,
      reason: `已连接 ${active.toolCount} 个工具`,
      toolCount: active.toolCount,
      serverName: active.serverName,
      serverVersion: active.serverVersion,
    }
  } catch (error) {
    const message = toErrorMessage(error, '连接失败')
    const failed = getMcpClientState(serverId)
    return {
      id: serverId,
      connected: false,
      reason: failed?.lastError ?? message,
    }
  }
}

export async function listMcpStatus(input: unknown) {
  const data = McpStatusListInputSchema.parse(input)
  const context: ToolExecutionContext = {
    workingDirectory: data.workingDirectory ?? homedir(),
    environmentVariables: data.environmentVariables,
  }

  const items: McpStatusItem[] = []

  for (const id of data.serverIds) {
    const config = getMcpServer(id)
    if (!config) {
      items.push({ id, connected: false, reason: '未知 MCP 服务器' })
      continue
    }

    if (config.type === 'builtin') {
      const builtinId = config.builtinId ?? id
      const checker = BUILTIN_CHECKS[builtinId]
      items.push(
        checker
          ? checker(context)
          : { id, connected: false, reason: '未知内置 MCP 服务器' },
      )
      continue
    }

    if (config.type === 'stdio' || config.type === 'sse' || config.type === 'streamableHttp') {
      items.push(await checkRemoteServer(id))
      continue
    }

    items.push({ id, connected: false, reason: '未知 MCP 服务器类型' })
  }

  return { items }
}

export function buildToolSystemHint(context: ToolExecutionContext, mcpServerIds: string[]): string {
  const hints: string[] = []

  if (mcpServerIds.includes('filesystem')) {
    hints.push('文件系统 MCP 提供 fs_read/fs_write/fs_edit/fs_delete/fs_list/fs_glob/fs_grep，路径限制在工作目录内。')
  }

  if (mcpServerIds.includes('sqlite')) {
    hints.push(`可用本地 SQLite 数据库:\n${getDefaultSqliteHint(context)}`)
  }

  if (mcpServerIds.includes('browser')) {
    hints.push('浏览器 MCP 提供 browser_open/browser_execute/browser_screenshot/browser_fetch 以及 http_fetch。')
  }

  if (mcpServerIds.includes('dify')) {
    hints.push('Dify MCP 提供 list_knowledges/search_knowledge，需配置 DIFY_KEY 与 API 地址。')
  }

  if (mcpServerIds.includes('hub')) {
    hints.push('Hub MCP 提供 hub_list/hub_invoke，可统一发现并调用其他 MCP 工具。')
  }

  if (mcpServerIds.includes('docx-mcp-server')) {
    hints.push(
      'DOCX MCP Server（docx-mcp-server）：Word 任务走结构化审查流水线（审查 prompt → issue JSON → add_comments/replace_text 批量写入修订版）。',
    )
  }

  if (mcpServerIds.includes('github')) {
    const env = parseEnvironmentVariables(context.environmentVariables)
    if (!env.GITHUB_TOKEN && !env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
      hints.push('GitHub MCP 需要 GITHUB_TOKEN 环境变量')
    }
  }

  const remoteServers = mcpServerIds
    .map((id) => getMcpServer(id))
    .filter(
      (server) =>
        server?.enabled &&
        (server.type === 'stdio' || server.type === 'sse' || server.type === 'streamableHttp'),
    )

  if (remoteServers.length > 0) {
    hints.push(
      [
        '已挂载外部 MCP 服务器：',
        ...remoteServers.map((server) => `- ${server!.name}（${server!.type}）`),
        '外部工具以 mcp__{serverId}__{toolName} 形式调用。',
      ].join('\n'),
    )
  }

  return hints.join('\n\n')
}
