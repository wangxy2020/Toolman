/** Mirrors desktop `community-sidebar-types` + panel / admin copy (zh). */

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

export type CommunityListKind = 'news' | 'messages' | 'market' | 'tasks'

export const COMMUNITY_SIDEBAR_SECTIONS: Array<{
  id: CommunitySidebarSection
  label: string
  title: string
  subtitle: string
  emptyHint: string
  publishLabel?: string
  showPublish?: boolean
  showRss?: boolean
  showInstall?: boolean
  listKind?: CommunityListKind
  resourceType?: 'knowledge' | 'mcp' | 'skill' | 'workflow'
}> = [
  {
    id: 'news',
    label: '资讯',
    title: '资讯',
    subtitle: '查看社区动态、更新公告与 RSS 拉取文章',
    emptyHint: '暂无资讯文章',
    publishLabel: '发布资讯',
    showPublish: false,
    showRss: true,
    listKind: 'news',
  },
  {
    id: 'messages',
    label: '留言板',
    title: '留言板',
    subtitle: '浏览社区留言与互动讨论',
    emptyHint: '暂无留言，点击右上角发布第一条留言',
    publishLabel: '发布留言',
    showPublish: true,
    listKind: 'messages',
  },
  {
    id: 'knowledge',
    label: '知识库市场',
    title: '知识库市场',
    subtitle: '浏览与安装社区公开的知识库合集',
    emptyHint: '暂无知识库资源',
    publishLabel: '发布知识库',
    showPublish: true,
    showInstall: true,
    listKind: 'market',
    resourceType: 'knowledge',
  },
  {
    id: 'mcp',
    label: 'MCP市场',
    title: 'MCP 市场',
    subtitle: '探索社区推荐的 MCP 服务器与工具集成',
    emptyHint: '暂无 MCP 资源，请确认 Community Hub 已启动并已发布资源',
    publishLabel: '发布 MCP',
    showPublish: true,
    showInstall: true,
    listKind: 'market',
    resourceType: 'mcp',
  },
  {
    id: 'skills',
    label: 'Skills市场',
    title: 'Skills 市场',
    subtitle: '发现与安装社区贡献的 Agent Skills',
    emptyHint: '暂无 Skills 资源',
    publishLabel: '发布 Skill',
    showPublish: true,
    showInstall: true,
    listKind: 'market',
    resourceType: 'skill',
  },
  {
    id: 'workflow',
    label: '工作流市场',
    title: '工作流市场',
    subtitle: '浏览与导入社区共享的自动化工作流',
    emptyHint: '暂无工作流资源',
    publishLabel: '发布工作流',
    showPublish: true,
    showInstall: true,
    listKind: 'market',
    resourceType: 'workflow',
  },
  {
    id: 'tasks',
    label: '任务市场',
    title: '任务市场',
    subtitle: '发布协作任务、申请接单并完成交付验收',
    emptyHint: '暂无任务，点击右上角发布任务',
    publishLabel: '发布任务',
    showPublish: true,
    listKind: 'tasks',
  },
  {
    id: 'mine',
    label: '我的',
    title: '我的',
    subtitle: '查看我的发布、安装、收藏与任务',
    emptyHint: '请先登录后查看个人数据',
  },
  {
    id: 'management',
    label: '管理',
    title: '社区管理',
    subtitle: '仅创始人或管理员可访问社区管理功能。',
    emptyHint: '需要管理权限',
  },
]

export function getCommunitySection(id: CommunitySidebarSection) {
  return COMMUNITY_SIDEBAR_SECTIONS.find((item) => item.id === id) ?? COMMUNITY_SIDEBAR_SECTIONS[0]!
}

export type UserCenterSectionId =
  | 'publishes'
  | 'messages'
  | 'installs'
  | 'likes'
  | 'favorites'
  | 'tasks'

export const USER_CENTER_SECTIONS: Array<{ id: UserCenterSectionId; label: string }> = [
  { id: 'publishes', label: '发布' },
  { id: 'messages', label: '我的留言' },
  { id: 'installs', label: '安装' },
  { id: 'likes', label: '点赞' },
  { id: 'favorites', label: '收藏' },
  { id: 'tasks', label: '任务' },
]

export type ModerationCategoryId = 'resources' | 'review' | 'online' | 'admin' | 'logs'

export const MODERATION_CATEGORIES: Array<{ id: ModerationCategoryId; label: string }> = [
  { id: 'resources', label: '资源' },
  { id: 'review', label: '审核' },
  { id: 'online', label: '在线' },
  { id: 'admin', label: '管理' },
  { id: 'logs', label: '处置日志' },
]

export const MODERATION_SUBTABS: Record<
  ModerationCategoryId,
  Array<{ id: string; label: string }>
> = {
  resources: [
    { id: 'messages', label: '留言' },
    { id: 'knowledge', label: '知识库' },
    { id: 'mcp', label: 'MCP' },
    { id: 'skill', label: 'Skills' },
    { id: 'workflow', label: '工作流' },
    { id: 'tasks', label: '任务' },
  ],
  review: [
    { id: 'pending', label: '待审核' },
    { id: 'reports', label: '举报队列' },
  ],
  online: [
    { id: 'desktop', label: '在线桌面端' },
    { id: 'mobile', label: '在线移动端' },
  ],
  admin: [
    { id: 'registeredUsers', label: '注册用户' },
    { id: 'admins', label: '管理员' },
    { id: 'blacklist', label: '黑名单' },
  ],
  logs: [{ id: 'logs', label: '处置日志' }],
}

export const COMMUNITY_ACTION_LABELS = {
  like: '点赞',
  comment: '评论',
  dislike: '点踩',
  favorite: '收藏',
  share: '转发',
  install: '安装',
  report: '举报',
} as const
