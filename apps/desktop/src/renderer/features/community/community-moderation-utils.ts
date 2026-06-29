import {
  type CommunityModerationReportResolveInput,
  type CommunityReportTargetType,
} from '@toolman/shared'

export const MODERATION_TAB_LABELS = {
  reports: '举报队列',
  resources: '在线资源',
  pending: '待审核',
  blacklist: '黑名单',
  devices: '在线设备',
  tasks: '任务',
  adminList: '管理员名单',
  adminAppoint: '管理员任命',
  logs: '处置日志',
} as const

export const REVIEW_SUB_TAB_LABELS = {
  pending: '待审核',
  reports: MODERATION_TAB_LABELS.reports,
} as const

export type ReviewSubTab = keyof typeof REVIEW_SUB_TAB_LABELS

export const MODERATION_CATEGORY_LABELS = {
  resources: '资源',
  review: '审核',
  online: '在线',
  admin: '管理',
  logs: '处置日志',
} as const

export type ModerationCategory = keyof typeof MODERATION_CATEGORY_LABELS

export const RESOURCE_SUB_TAB_LABELS = {
  messages: '留言',
  knowledge: '知识库',
  mcp: 'MCP',
  skill: 'Skills',
  workflow: '工作流',
  tasks: '任务',
} as const

export type ResourceSubTab = keyof typeof RESOURCE_SUB_TAB_LABELS

export const ONLINE_SUB_TAB_LABELS = {
  desktop: '在线桌面端',
  mobile: '在线移动端',
} as const

export type OnlineSubTab = keyof typeof ONLINE_SUB_TAB_LABELS

export const ADMIN_SUB_TAB_LABELS = {
  registeredUsers: '注册用户',
  admins: '管理员',
  blacklist: '黑名单',
} as const

export type AdminSubTab = keyof typeof ADMIN_SUB_TAB_LABELS

export const DEFAULT_SUB_TAB_BY_CATEGORY = {
  resources: 'messages',
  review: 'pending',
  online: 'desktop',
  admin: 'registeredUsers',
  logs: 'logs',
} as const satisfies Record<ModerationCategory, string>

export type ModerationSubTab =
  | ResourceSubTab
  | ReviewSubTab
  | OnlineSubTab
  | AdminSubTab
  | 'logs'

export function getDefaultReportResolveAction(
  targetType: CommunityReportTargetType,
): CommunityModerationReportResolveInput['action'] {
  switch (targetType) {
    case 'resource':
      return 'suspend_and_ban_author'
    case 'comment':
      return 'delete_comment'
    case 'task':
      return 'cancel_task'
    case 'user':
      return 'ban_user'
    default:
      return 'dismiss_report'
  }
}
