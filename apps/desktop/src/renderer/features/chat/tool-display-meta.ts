export interface ToolDisplayMeta {
  title: string
  description: string
  commandStyle: boolean
  buildCommand: (args: Record<string, unknown>) => string
}

const COMMAND_STYLE_TOOLS = new Set([
  'bash',
  'fs_glob',
  'fs_grep',
  'fs_list',
  'fs_read',
  'fs_write',
  'fs_edit',
  'fs_delete',
  'glob',
  'grep',
  'edit',
  'sql_list_tables',
  'sql_query',
  'http_fetch',
  'browser_open',
  'browser_execute',
  'browser_screenshot',
  'browser_fetch',
  'github_request',
  'fetch_html',
  'fetch_markdown',
  'fetch_txt',
  'fetch_json',
  'brave_web_search',
  'brave_local_search',
  'python_execute',
  'list_knowledges',
  'search_knowledge',
  'list_local_knowledges',
  'search_local_knowledge',
  'hub_list',
  'hub_invoke',
  'memory_list',
  'agent_task_list',
])

const TOOL_META: Record<string, ToolDisplayMeta> = {
  bash: {
    title: '执行命令',
    description: '在智能体工作目录中执行 Shell 命令',
    commandStyle: true,
    buildCommand: (args) => String(args.command ?? ''),
  },
  fs_glob: {
    title: '执行命令',
    description: '按 glob 模式查找文件',
    commandStyle: true,
    buildCommand: (args) => `glob ${String(args.pattern ?? '**/*')}`,
  },
  glob: {
    title: '执行命令',
    description: '按 glob 模式查找文件',
    commandStyle: true,
    buildCommand: (args) => `glob ${String(args.pattern ?? '**/*')}`,
  },
  fs_grep: {
    title: '执行命令',
    description: '在文件内容中搜索匹配项',
    commandStyle: true,
    buildCommand: (args) => `grep ${String(args.pattern ?? '')} ${String(args.path ?? '.')}`,
  },
  grep: {
    title: '执行命令',
    description: '在文件内容中搜索匹配项',
    commandStyle: true,
    buildCommand: (args) => `grep ${String(args.pattern ?? '')} ${String(args.path ?? '.')}`,
  },
  fs_list: {
    title: '执行命令',
    description: '列出目录中的文件和子目录',
    commandStyle: true,
    buildCommand: (args) => `list ${String(args.path ?? '.')}`,
  },
  fs_read: {
    title: '执行命令',
    description: '读取本地文件内容',
    commandStyle: true,
    buildCommand: (args) => `read ${String(args.path ?? '')}`,
  },
  fs_write: {
    title: '写入文件',
    description: '写入或覆盖本地文件',
    commandStyle: true,
    buildCommand: (args) => `write ${String(args.path ?? '')}`,
  },
  fs_edit: {
    title: '编辑文件',
    description: '对文件进行精确字符串替换',
    commandStyle: true,
    buildCommand: (args) => `edit ${String(args.path ?? '')}`,
  },
  edit: {
    title: '编辑文件',
    description: '对文件进行精确字符串替换',
    commandStyle: true,
    buildCommand: (args) => `edit ${String(args.path ?? '')}`,
  },
  fs_delete: {
    title: '删除文件',
    description: '删除工作目录内的文件',
    commandStyle: true,
    buildCommand: (args) => `delete ${String(args.path ?? '')}`,
  },
  sql_list_tables: {
    title: '执行命令',
    description: '列出 SQLite 数据库中的所有表',
    commandStyle: true,
    buildCommand: (args) => `.tables ${String(args.database ?? '')}`,
  },
  sql_query: {
    title: '执行命令',
    description: '对本地 SQLite 数据库执行 SQL 查询',
    commandStyle: true,
    buildCommand: (args) => String(args.sql ?? ''),
  },
  http_fetch: {
    title: '执行命令',
    description: '获取网页或 API 内容',
    commandStyle: true,
    buildCommand: (args) => `${String(args.method ?? 'GET')} ${String(args.url ?? '')}`,
  },
  browser_open: {
    title: '执行命令',
    description: '在 CDP 浏览器中打开 URL',
    commandStyle: true,
    buildCommand: (args) => `open ${String(args.url ?? '')}`,
  },
  browser_execute: {
    title: '执行命令',
    description: '在浏览器会话中执行 JavaScript',
    commandStyle: true,
    buildCommand: (args) => String(args.script ?? args.code ?? ''),
  },
  browser_screenshot: {
    title: '执行命令',
    description: '截取浏览器页面截图',
    commandStyle: true,
    buildCommand: (args) => `screenshot ${String(args.sessionId ?? 'current')}`,
  },
  browser_fetch: {
    title: '执行命令',
    description: '打开 URL 并提取页面文本',
    commandStyle: true,
    buildCommand: (args) => `fetch ${String(args.url ?? '')}`,
  },
  github_request: {
    title: '执行命令',
    description: '调用 GitHub REST API',
    commandStyle: true,
    buildCommand: (args) => `${String(args.method ?? 'GET')} ${String(args.path ?? '')}`,
  },
  fetch_html: {
    title: '执行命令',
    description: '抓取网页 HTML',
    commandStyle: true,
    buildCommand: (args) => `fetch html ${String(args.url ?? '')}`,
  },
  fetch_markdown: {
    title: '执行命令',
    description: '抓取网页并转为 Markdown',
    commandStyle: true,
    buildCommand: (args) => `fetch markdown ${String(args.url ?? '')}`,
  },
  fetch_txt: {
    title: '执行命令',
    description: '抓取网页纯文本',
    commandStyle: true,
    buildCommand: (args) => `fetch txt ${String(args.url ?? '')}`,
  },
  fetch_json: {
    title: '执行命令',
    description: '获取 JSON 数据',
    commandStyle: true,
    buildCommand: (args) => `fetch json ${String(args.url ?? '')}`,
  },
  brave_web_search: {
    title: '执行命令',
    description: 'Brave 网页搜索',
    commandStyle: true,
    buildCommand: (args) => `search ${String(args.query ?? '')}`,
  },
  brave_local_search: {
    title: '执行命令',
    description: 'Brave 本地搜索',
    commandStyle: true,
    buildCommand: (args) => `local search ${String(args.query ?? '')}`,
  },
  python_execute: {
    title: '执行命令',
    description: '执行 Python 代码',
    commandStyle: true,
    buildCommand: (args) => String(args.code ?? '').split('\n')[0] ?? 'python',
  },
  list_knowledges: {
    title: '执行命令',
    description: '列出 Dify 知识库',
    commandStyle: true,
    buildCommand: () => 'dify list',
  },
  search_knowledge: {
    title: '执行命令',
    description: '检索 Dify 知识库',
    commandStyle: true,
    buildCommand: (args) => `dify search ${String(args.query ?? '')}`,
  },
  list_local_knowledges: {
    title: '执行命令',
    description: '列出本地知识库',
    commandStyle: true,
    buildCommand: () => 'local-kb list',
  },
  search_local_knowledge: {
    title: '执行命令',
    description: '检索本地知识库',
    commandStyle: true,
    buildCommand: (args) => `local-kb search ${String(args.query ?? '')}`,
  },
  hub_list: {
    title: '执行命令',
    description: '列出所有 MCP 工具',
    commandStyle: true,
    buildCommand: () => 'hub list',
  },
  hub_invoke: {
    title: '执行命令',
    description: '通过 Hub 调用 MCP 工具',
    commandStyle: true,
    buildCommand: (args) => `hub invoke ${String(args.name ?? '')}`,
  },
  memory_list: {
    title: '执行命令',
    description: '列出当前可用的长期记忆',
    commandStyle: true,
    buildCommand: () => 'memory list',
  },
  memory_save: {
    title: '保存记忆',
    description: '保存一条跨会话长期记忆',
    commandStyle: false,
    buildCommand: () => 'memory save',
  },
  agent_task_list: {
    title: '执行命令',
    description: '列出当前智能体的任务清单',
    commandStyle: true,
    buildCommand: () => 'task list',
  },
  agent_task_create: {
    title: '创建任务',
    description: '创建一项待办任务',
    commandStyle: false,
    buildCommand: (args) => `task create ${String(args.title ?? '')}`,
  },
  agent_task_update: {
    title: '更新任务',
    description: '更新任务状态或备注',
    commandStyle: false,
    buildCommand: (args) => `task update ${String(args.taskId ?? '')}`,
  },
}

export function normalizeToolName(toolName: string): string {
  if (!toolName.startsWith('mcp__')) return toolName
  const parts = toolName.split('__')
  return parts[parts.length - 1] ?? toolName
}

export function parseToolArguments(raw?: string): Record<string, unknown> {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function resolveToolDisplayMeta(toolName: string): ToolDisplayMeta {
  const shortName = normalizeToolName(toolName)
  const known = TOOL_META[shortName]
  if (known) return known

  if (toolName.startsWith('mcp__')) {
    return {
      title: '执行命令',
      description: `调用 MCP 工具 ${shortName}`,
      commandStyle: true,
      buildCommand: (args) => {
        const payload = Object.keys(args).length ? ` ${JSON.stringify(args)}` : ''
        return `${shortName}${payload}`
      },
    }
  }

  return {
    title: '执行工具',
    description: `调用 ${toolName}`,
    commandStyle: COMMAND_STYLE_TOOLS.has(shortName),
    buildCommand: (args) => {
      const payload = Object.keys(args).length ? JSON.stringify(args) : toolName
      return payload
    },
  }
}

export function usesCommandStyle(toolName: string): boolean {
  return resolveToolDisplayMeta(toolName).commandStyle
}
