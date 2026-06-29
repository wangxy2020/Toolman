export type CommunitySidebarSection =
  | 'news'
  | 'messages'
  | 'knowledge'
  | 'mcp'
  | 'skills'
  | 'workflow'
  | 'tasks'
  | 'mine'
  | 'management'

export const DEFAULT_COMMUNITY_SIDEBAR_SECTION: CommunitySidebarSection = 'news'

export const COMMUNITY_SIDEBAR_SECTIONS: Array<{
  id: CommunitySidebarSection
  label: string
}> = [
  { id: 'news', label: '资讯' },
  { id: 'messages', label: '留言板' },
  { id: 'knowledge', label: '知识库市场' },
  { id: 'mcp', label: 'MCP市场' },
  { id: 'skills', label: 'Skills市场' },
  { id: 'workflow', label: '工作流市场' },
  { id: 'tasks', label: '任务市场' },
  { id: 'mine', label: '我的' },
  { id: 'management', label: '管理' },
]

export const COMMUNITY_SECTION_TO_ACTION: Record<CommunitySidebarSection, string> = {
  news: 'news',
  messages: 'messages',
  knowledge: 'knowledge',
  mcp: 'mcp',
  skills: 'skills',
  workflow: 'workflow',
  tasks: 'tasks',
  mine: 'subscribe',
  management: 'management',
}
