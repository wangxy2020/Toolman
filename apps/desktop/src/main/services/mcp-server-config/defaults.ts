import type { McpServerConfig } from '@toolman/shared'
import {
  DEFAULT_MCP_SERVER_IDS,
  LOCAL_DB_MCP_SERVER_ID,
  MCP_SERVER_IDS,
  isDefaultEnabledMcpServer,
} from '@toolman/shared'
import { resolveDocxMcpServerEntryPath } from '../docx-mcp-paths'
import { resolveExcelMcpServerEntryPath } from '../excel-mcp-paths'
import { resolveMcpNodeCommand } from '../mcp-node-runtime'

const BUILTIN_SERVER_META: Record<
  (typeof MCP_SERVER_IDS)[number],
  { name: string; description: string }
> = {
  filesystem: { name: 'Filesystem', description: '读写本地文件系统（内置）' },
  browser: { name: 'Browser', description: '浏览网页与抓取内容（内置）' },
  github: { name: 'GitHub', description: '访问 GitHub 仓库与 Issue（内置）' },
  sqlite: { name: 'SQLite', description: '查询本地 SQLite 数据库（内置）' },
  dify: { name: 'Dify Knowledge', description: '检索 Dify 知识库（内置）' },
  hub: { name: 'Hub', description: '聚合所有 MCP 工具的统一入口（内置）' },
}

const BUILTIN_DEFAULT_CONFIG: Partial<
  Record<(typeof MCP_SERVER_IDS)[number], Partial<McpServerConfig>>
> = {
  dify: {
    providerUrl: 'https://api.dify.ai/v1',
    env: { DIFY_KEY: '' },
  },
}

export function defaultBuiltinServers(): McpServerConfig[] {
  return MCP_SERVER_IDS.map((id) => ({
    id,
    name: BUILTIN_SERVER_META[id].name,
    description: BUILTIN_SERVER_META[id].description,
    type: 'builtin' as const,
    enabled: isDefaultEnabledMcpServer(id),
    builtinId: id,
    ...(BUILTIN_DEFAULT_CONFIG[id] ?? {}),
  }))
}

function defaultLocalDbServer(): McpServerConfig {
  return {
    id: LOCAL_DB_MCP_SERVER_ID,
    name: 'Local-db',
    description: '访问本地 PostgreSQL 数据库',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer(LOCAL_DB_MCP_SERVER_ID),
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-postgres',
      'postgres://postgres@localhost:5432/postgres',
    ],
    env: {},
    packageSource: 'default',
    longRunning: false,
    timeoutSeconds: 60,
    dbHost: 'localhost',
    dbPort: '5432',
    dbUser: 'postgres',
    dbPassword: '',
    dbName: 'postgres',
  }
}

function defaultFetchServer(): McpServerConfig {
  return {
    id: 'fetch',
    name: 'Fetch',
    description: '官方 fetch MCP，抓取网页 HTML/Markdown/文本/JSON（uvx）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('fetch'),
    command: 'uvx',
    args: ['mcp-server-fetch'],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 60,
  }
}

function defaultMemoryPreset(): McpServerConfig {
  return {
    id: 'memory',
    name: 'Memory',
    description: '官方知识图谱记忆 MCP（npx）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('memory'),
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 60,
  }
}

function defaultPythonPreset(): McpServerConfig {
  return {
    id: 'python',
    name: 'Python',
    description: '官方 Python 执行 MCP（uvx）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('python'),
    command: 'uvx',
    args: ['mcp-python-interpreter'],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 120,
  }
}

function defaultBraveSearchPreset(): McpServerConfig {
  return {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Brave Search 官方 MCP，需配置 BRAVE_API_KEY',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('brave-search'),
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 60,
  }
}

function defaultDocxMcpServerPreset(): McpServerConfig {
  const entryPath = resolveDocxMcpServerEntryPath()
  return {
    id: 'docx-mcp-server',
    name: 'Toolman DOCX MCP',
    description:
      'Word (.docx/.doc/.wps) 读写、批注、高亮、修订与排版；本地 stdio（内置 docx-mcp-server + Rust 格式桥）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('docx-mcp-server'),
    command: resolveMcpNodeCommand(),
    args: entryPath ? [entryPath] : [],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 120,
  }
}

function defaultExcelMcpServerPreset(): McpServerConfig {
  const entryPath = resolveExcelMcpServerEntryPath()
  return {
    id: 'excel-mcp-server',
    name: 'Toolman Excel MCP',
    description:
      'Excel (.xlsx/.xls) 无损审核、单元格修改与高亮批注；本地 stdio（内置 excel-mcp-server，需 Node.js 20+）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('excel-mcp-server'),
    command: resolveMcpNodeCommand(),
    args: entryPath ? [entryPath] : [],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 120,
  }
}

export function defaultSystemMcpServers(): McpServerConfig[] {
  return [
    defaultLocalDbServer(),
    defaultFetchServer(),
    defaultMemoryPreset(),
    defaultPythonPreset(),
    defaultBraveSearchPreset(),
    defaultDocxMcpServerPreset(),
    defaultExcelMcpServerPreset(),
  ]
}

export function isSystemDefaultMcpServer(id: string): boolean {
  return DEFAULT_MCP_SERVER_IDS.includes(id as (typeof DEFAULT_MCP_SERVER_IDS)[number])
}

export function defaultAllServers(): McpServerConfig[] {
  return [...defaultBuiltinServers(), ...defaultSystemMcpServers()]
}
