import type { ToolDefinition } from '@toolman/model-gateway'
import { getMcpServer } from './mcp-server-config.service'
import { ensureMcpServersConnected, getMcpClientState } from './mcp-client-manager.service'
import { encodeMcpToolName } from './mcp-tool-utils'

export interface ResolveToolOptions {
  autonomousMode?: boolean
  memoryEnabled?: boolean
  localKnowledgeEnabled?: boolean
  notesEnabled?: boolean
}

const PREAUTH_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '在智能体工作目录中执行 Shell 命令',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          cwd: { type: 'string', description: '工作目录，默认为智能体工作目录' },
        },
        required: ['command'],
      },
    },
  },
]

export const BUILTIN_MCP_TOOL_DEFS: Record<string, ToolDefinition[]> = {
  filesystem: [
    {
      type: 'function',
      function: {
        name: 'fs_read',
        description: '读取本地文件内容',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径（相对工作目录或绝对路径）' },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fs_write',
        description: '写入或覆盖本地文件',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '文件内容' },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fs_edit',
        description: '对文件进行精确字符串替换编辑',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            oldText: { type: 'string', description: '要被替换的原文本' },
            newText: { type: 'string', description: '替换后的新文本' },
          },
          required: ['path', 'oldText', 'newText'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fs_delete',
        description: '删除工作目录内的文件',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fs_list',
        description: '列出目录中的文件和子目录',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径，默认为工作目录' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fs_glob',
        description: '按 glob 模式查找文件，返回匹配路径列表',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'glob 模式，例如 **/*.ts' },
            path: { type: 'string', description: '搜索起始目录，默认为工作目录' },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fs_grep',
        description: '在文件内容中搜索正则或文本模式',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: '搜索模式（字符串或正则）' },
            path: { type: 'string', description: '文件或目录路径，默认为工作目录' },
            ignoreCase: { type: 'boolean', description: '是否忽略大小写' },
          },
          required: ['pattern'],
        },
      },
    },
  ],
  sqlite: [
    {
      type: 'function',
      function: {
        name: 'sql_list_tables',
        description: '列出 SQLite 数据库中的所有表',
        parameters: {
          type: 'object',
          properties: {
            database: {
              type: 'string',
              description: 'SQLite 数据库文件路径（.db / .sqlite），相对工作目录或绝对路径',
            },
          },
          required: ['database'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'sql_query',
        description: '对本地 SQLite 数据库执行 SQL 查询（默认只读 SELECT）',
        parameters: {
          type: 'object',
          properties: {
            database: { type: 'string', description: 'SQLite 数据库文件路径' },
            sql: { type: 'string', description: 'SQL 语句' },
          },
          required: ['database', 'sql'],
        },
      },
    },
  ],
  browser: [
    {
      type: 'function',
      function: {
        name: 'browser_open',
        description: '在 CDP 浏览器中打开 URL',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'HTTP/HTTPS URL' },
            show: { type: 'boolean', description: '是否显示浏览器窗口' },
            sessionId: { type: 'string', description: '复用已有会话 ID（可选）' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'browser_execute',
        description: '在当前浏览器会话中执行 JavaScript',
        parameters: {
          type: 'object',
          properties: {
            script: { type: 'string', description: '要执行的 JavaScript 代码' },
            sessionId: { type: 'string', description: '浏览器会话 ID（可选）' },
          },
          required: ['script'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'browser_screenshot',
        description: '截取当前浏览器页面截图',
        parameters: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '浏览器会话 ID（可选）' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'browser_fetch',
        description: '打开 URL 并提取页面文本内容（一次性会话）',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'HTTP/HTTPS URL' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'http_fetch',
        description: '通过 HTTP 请求获取网页或 API 文本内容',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'HTTP/HTTPS URL' },
            method: { type: 'string', description: 'HTTP 方法，默认 GET' },
          },
          required: ['url'],
        },
      },
    },
  ],
  github: [
    {
      type: 'function',
      function: {
        name: 'github_request',
        description: '调用 GitHub REST API（需要 GITHUB_TOKEN 环境变量）',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'API 路径，如 /repos/owner/repo/issues' },
            method: { type: 'string', description: 'HTTP 方法，默认 GET' },
            body: { type: 'string', description: 'JSON 请求体（可选）' },
          },
          required: ['path'],
        },
      },
    },
  ],
  dify: [
    {
      type: 'function',
      function: {
        name: 'list_knowledges',
        description: '列出 Dify 账号下的所有知识库',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_knowledge',
        description: '在指定 Dify 知识库中检索内容',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '知识库 ID' },
            query: { type: 'string', description: '检索问题' },
            topK: { type: 'number', description: '返回条数，默认 6' },
          },
          required: ['id', 'query'],
        },
      },
    },
  ],
  hub: [
    {
      type: 'function',
      function: {
        name: 'hub_list',
        description: '列出所有已启用 MCP 服务器的工具（分页）',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: '每页数量，默认 30' },
            offset: { type: 'number', description: '偏移量，默认 0' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'hub_invoke',
        description: '通过 Hub 调用任意已注册 MCP 工具',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '工具名或 mcp__serverId__toolName' },
            params: { type: 'object', description: '工具参数 JSON 对象' },
          },
          required: ['name'],
        },
      },
    },
  ],
}

const MEMORY_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'memory_save',
      description: '保存一条跨会话长期记忆',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要记住的内容' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_list',
      description: '列出当前可用的长期记忆',
      parameters: { type: 'object', properties: {} },
    },
  },
]

const NOTES_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: '搜索用户笔记的标题、正文与标签',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          tag: { type: 'string', description: '可选，按标签筛选' },
          notebookId: { type: 'string', description: '可选，限定笔记本 ID' },
          limit: { type: 'number', description: '返回条数，默认 10' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: '读取一篇笔记的完整 Markdown 内容',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: '笔记 ID（来自 search_notes 结果）' },
        },
        required: ['noteId'],
      },
    },
  },
]

const LOCAL_KNOWLEDGE_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_local_knowledges',
      description: '列出当前工作区的本地知识库',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_local_knowledge',
      description:
        '在当前工作区的本地知识库中检索内容。未指定 kbId 时，仅检索当前智能体已绑定的知识库；若未绑定则检索工作区内全部知识库。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索问题' },
          kbId: { type: 'string', description: '可选，指定单个知识库 ID；省略时按智能体绑定范围检索' },
          topK: { type: 'number', description: '返回条数，默认 6' },
        },
        required: ['query'],
      },
    },
  },
]

const AUTONOMOUS_TASK_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'agent_task_create',
      description: '创建一项待办任务，用于自主推进多步骤工作',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
          notes: { type: 'string', description: '补充说明（可选）' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_task_update',
      description: '更新任务状态或备注',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务 ID' },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'cancelled'],
            description: '任务状态',
          },
          notes: { type: 'string', description: '更新备注（可选）' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_task_list',
      description: '列出当前智能体的任务清单',
      parameters: { type: 'object', properties: {} },
    },
  },
]

function normalizeToolParameters(schema?: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} }
  }
  if (schema.type === 'object') {
    return schema
  }
  return {
    type: 'object',
    properties: (schema.properties as Record<string, unknown> | undefined) ?? {},
    required: schema.required,
  }
}

function mcpToolToDefinition(
  serverId: string,
  serverName: string,
  tool: { name: string; description?: string; inputSchema?: Record<string, unknown> },
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: encodeMcpToolName(serverId, tool.name),
      description: `[${serverName}] ${tool.description ?? tool.name}`,
      parameters: normalizeToolParameters(tool.inputSchema),
    },
  }
}

function isRemoteMcpType(type: string | undefined): boolean {
  return type === 'stdio' || type === 'sse' || type === 'streamableHttp'
}

export async function resolveToolDefinitions(
  mcpServerIds: string[],
  options?: ResolveToolOptions,
): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [...PREAUTH_TOOL_DEFS]
  const seen = new Set(tools.map((tool) => tool.function.name))

  await ensureMcpServersConnected(mcpServerIds)

  for (const serverId of mcpServerIds) {
    const config = getMcpServer(serverId)
    if (!config?.enabled) continue

    if (config.type === 'builtin') {
      const builtinId = config.builtinId ?? serverId
      for (const tool of BUILTIN_MCP_TOOL_DEFS[builtinId] ?? []) {
        if (seen.has(tool.function.name)) continue
        seen.add(tool.function.name)
        tools.push(tool)
      }
      continue
    }

    if (!isRemoteMcpType(config.type)) continue

    const active = getMcpClientState(serverId)
    if (!active?.connected) continue

    const result = await active.client.listTools()
    for (const tool of result.tools) {
      const encodedName = encodeMcpToolName(serverId, tool.name)
      if (seen.has(encodedName)) continue
      seen.add(encodedName)
      tools.push(mcpToolToDefinition(serverId, config.name, tool))
    }
  }

  if (options?.memoryEnabled) {
    for (const tool of MEMORY_TOOL_DEFS) {
      if (seen.has(tool.function.name)) continue
      seen.add(tool.function.name)
      tools.push(tool)
    }
  }

  if (options?.localKnowledgeEnabled) {
    for (const tool of LOCAL_KNOWLEDGE_TOOL_DEFS) {
      if (seen.has(tool.function.name)) continue
      seen.add(tool.function.name)
      tools.push(tool)
    }
  }

  if (options?.notesEnabled !== false) {
    for (const tool of NOTES_TOOL_DEFS) {
      if (seen.has(tool.function.name)) continue
      seen.add(tool.function.name)
      tools.push(tool)
    }
  }

  if (options?.autonomousMode) {
    for (const tool of AUTONOMOUS_TASK_TOOL_DEFS) {
      if (seen.has(tool.function.name)) continue
      seen.add(tool.function.name)
      tools.push(tool)
    }
  }

  return tools
}

export async function hasConfiguredTools(
  mcpServerIds: string[],
  options?: ResolveToolOptions,
): Promise<boolean> {
  const tools = await resolveToolDefinitions(mcpServerIds, options)
  return tools.length > PREAUTH_TOOL_DEFS.length
}
