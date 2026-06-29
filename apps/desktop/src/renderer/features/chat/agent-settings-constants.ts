export type PermissionMode = 'normal' | 'plan' | 'auto-edit' | 'full-auto'

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
    name: 'Toolman DOCX MCP',
    description: 'Word 文档读写、批注、修订与排版（内置）',
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
