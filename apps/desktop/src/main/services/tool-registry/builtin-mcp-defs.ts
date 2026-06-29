import type { ToolDefinition } from '@toolman/model-gateway'

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
