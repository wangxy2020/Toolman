/** Mirrors desktop group header actions (`group-page-header-actions`). */

export const GROUP_SIDEBAR_ACTIONS = [
  'members',
  'messages',
  'agents',
  'knowledge',
  'notes',
  'workflow',
  'activity',
] as const

export type GroupSidebarAction = (typeof GROUP_SIDEBAR_ACTIONS)[number]

export const DEFAULT_GROUP_ACTION: GroupSidebarAction = 'messages'

export type GroupSidebarMenu = {
  id: GroupSidebarAction
  label: string
  title: string
  typeNoun: string
  emptyTitle: string
  emptyHint: string
}

export const GROUP_SIDEBAR_MENUS: GroupSidebarMenu[] = [
  {
    id: 'members',
    label: '群组成员',
    title: '群组成员',
    typeNoun: '成员',
    emptyTitle: '暂无成员',
    emptyHint: '群组成员会显示在这里。',
  },
  {
    id: 'messages',
    label: '群组消息',
    title: '群组消息',
    typeNoun: '消息',
    emptyTitle: '暂无消息',
    emptyHint: '在这里输入消息，按 Enter 发送。此处发送的是群组消息，不会调用大模型。',
  },
  {
    id: 'agents',
    label: '群组智能体',
    title: '群组智能体',
    typeNoun: '智能体',
    emptyTitle: '暂无群组智能体',
    emptyHint: '从已有智能体中选择，共享给群组成员。完整添加与同步请使用桌面端。',
  },
  {
    id: 'knowledge',
    label: '群组知识库',
    title: '群组知识库',
    typeNoun: '知识库',
    emptyTitle: '暂无群组知识库',
    emptyHint: '从已有知识库中选择，共享给群组成员。完整添加与同步请使用桌面端。',
  },
  {
    id: 'notes',
    label: '群组笔记',
    title: '群组笔记',
    typeNoun: '笔记',
    emptyTitle: '暂无群组笔记',
    emptyHint: '从已有笔记中选择，共享给群组成员。完整添加与同步请使用桌面端。',
  },
  {
    id: 'workflow',
    label: '群组工作流',
    title: '群组工作流',
    typeNoun: '工作流',
    emptyTitle: '暂无群组工作流',
    emptyHint: '从已有工作流中选择，共享给群组成员。完整添加与同步请使用桌面端。',
  },
  {
    id: 'activity',
    label: '群组活动记录',
    title: '群组活动记录',
    typeNoun: '记录',
    emptyTitle: '暂无活动记录',
    emptyHint: '创建群组、加入成员等操作会显示在这里。',
  },
]

export function getGroupSidebarMenu(id: GroupSidebarAction): GroupSidebarMenu {
  return GROUP_SIDEBAR_MENUS.find((menu) => menu.id === id) ?? GROUP_SIDEBAR_MENUS[1]!
}
