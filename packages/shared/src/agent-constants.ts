export const BUILTIN_SKILLS = [
  {
    id: 'find-skills',
    name: '发现技能',
    description:
      '当用户询问「怎么做 X」「有没有能做 X 的技能」或想扩展智能体能力时，帮助发现并安装合适的技能。',
    builtin: true,
  },
  {
    id: 'skill-creator',
    name: '技能创建器',
    description:
      '创建新技能、修改并改进现有技能。适用于用户想从零编写技能、编辑或更新已有技能的场景。',
    builtin: true,
  },
] as const

export const BUILTIN_SKILL_IDS = BUILTIN_SKILLS.map((skill) => skill.id)

export function getDefaultSkillIds(): string[] {
  return [...BUILTIN_SKILL_IDS]
}

/** 进程内内置 MCP（type: builtin） */
export const MCP_SERVER_IDS = ['filesystem', 'browser', 'github', 'sqlite', 'dify', 'hub'] as const

/** 系统预置 MCP（不可删除） */
export const DEFAULT_MCP_SERVER_IDS = [
  'local-db',
  'fetch',
  'memory',
  'python',
  'brave-search',
] as const

export const LOCAL_DB_MCP_SERVER_ID = 'local-db'

/** 默认启用的 MCP 服务器（全局配置与新建智能体） */
export const DEFAULT_ENABLED_MCP_SERVER_IDS = [
  'filesystem',
  'browser',
  'local-db',
  'memory',
  'python',
] as const

const DEFAULT_ENABLED_MCP_SERVER_ID_SET = new Set<string>(DEFAULT_ENABLED_MCP_SERVER_IDS)

export function isDefaultEnabledMcpServer(serverId: string): boolean {
  return DEFAULT_ENABLED_MCP_SERVER_ID_SET.has(serverId)
}

export function getDefaultMcpServerIds(): string[] {
  return [...DEFAULT_ENABLED_MCP_SERVER_IDS]
}

/** 设置页 MCP 分组（顺序即页面展示顺序） */
export const MCP_SETTINGS_CATEGORIES = [
  {
    id: 'servers',
    title: 'MCP 服务器',
    description:
      '通过 Model Context Protocol 连接外部工具服务器。内置服务器使用本地实现；自定义服务器通过 stdio 子进程连接。',
    serverIds: [
      'fetch',
      'memory',
      'python',
      'brave-search',
      'filesystem',
      'browser',
      'github',
      'dify',
      'hub',
    ],
  },
  {
    id: 'database',
    title: '数据库',
    description: '查询本地 SQLite 或连接 PostgreSQL 等远程数据库',
    serverIds: ['local-db', 'sqlite'],
  },
] as const

export function getMcpSettingsCategoryId(serverId: string): string {
  for (const category of MCP_SETTINGS_CATEGORIES) {
    if ((category.serverIds as readonly string[]).includes(serverId)) {
      return category.id
    }
  }
  return 'custom'
}
