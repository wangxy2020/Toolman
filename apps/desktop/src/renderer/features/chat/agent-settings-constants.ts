export type PermissionMode = 'normal' | 'plan' | 'auto-edit' | 'full-auto'

export const PERMISSION_MODES: {
  id: PermissionMode
  title: string
  description: string
  warning?: string
}[] = [
  {
    id: 'normal',
    title: '普通模式',
    description: '可自由读取文件，编辑或执行命令前会询问。',
  },
  {
    id: 'plan',
    title: '计划模式',
    description: '只能读取文件和制定计划，不能编辑文件或执行命令。',
  },
  {
    id: 'auto-edit',
    title: '自动编辑模式',
    description: '可自由读取和编辑文件，执行命令前会询问。',
  },
  {
    id: 'full-auto',
    title: '全自动模式',
    description: '可执行任何操作，无需询问。请谨慎使用。',
    warning: '危险：所有工具都会在无审批情况下执行。',
  },
]

export const PREAUTH_TOOLS = [
  {
    id: 'bash',
    name: 'Bash',
    description: '在你的环境中执行 Shell 命令',
    tagOff: '禁用时需要人工审批',
    tagOn: '已启用',
    defaultEnabled: false,
  },
] as const

export const MCP_SERVERS = [
  { id: 'filesystem', name: 'Filesystem', description: '读写、搜索、编辑与删除本地文件' },
  { id: 'browser', name: 'Browser', description: 'CDP 浏览器自动化与网页抓取' },
  { id: 'github', name: 'GitHub', description: '访问 GitHub 仓库与 Issue' },
  { id: 'sqlite', name: 'SQLite', description: '查询本地 SQLite 数据库' },
  { id: 'fetch', name: 'Fetch', description: '官方 fetch MCP（uvx）' },
  { id: 'memory', name: 'Memory', description: '官方知识图谱记忆 MCP（npx）' },
  { id: 'python', name: 'Python', description: '官方 Python 执行 MCP（uvx）' },
  { id: 'brave-search', name: 'Brave Search', description: 'Brave Search 官方 MCP（需 API Key）' },
  {
    id: 'docx-mcp-server',
    name: 'DOCX MCP Server',
    description: 'Word 文档读写、批注、修订与排版（npx）',
  },
  {
    id: 'excel-mcp-server',
    name: 'Toolman Excel MCP',
    description: 'Excel 无损审核、单元格修改与高亮批注（内置）',
  },
  { id: 'dify', name: 'Dify Knowledge', description: '检索 Dify 知识库' },
  { id: 'hub', name: 'Hub', description: '聚合所有 MCP 工具' },
  { id: 'local-db', name: 'Local-db', description: '访问本地 PostgreSQL 数据库' },
] as const

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'normal'
export const DEFAULT_SESSION_ROUND_LIMIT = 100

export function getDefaultToolStates(): Record<string, boolean> {
  return Object.fromEntries(PREAUTH_TOOLS.map((t) => [t.id, t.defaultEnabled]))
}

export { getDefaultMcpServerIds, getDefaultSkillIds } from '@toolman/shared'
