import {
  type CommunityModerationReportResolveInput,
  type CommunityReportReason,
  type CommunityReportStatus,
  type CommunityReportTargetType,
} from '@toolman/shared'

export const MODERATION_REPORT_REASON_LABELS: Record<CommunityReportReason, string> = {
  spam: '垃圾信息',
  illegal: '违法违规',
  copyright: '侵权内容',
  other: '其他',
}

export const MODERATION_REPORT_STATUS_LABELS: Record<CommunityReportStatus, string> = {
  open: '待处理',
  reviewing: '审核中',
  resolved: '已处理',
  dismissed: '已驳回',
}

export const MODERATION_TARGET_TYPE_LABELS: Record<CommunityReportTargetType, string> = {
  resource: '资源',
  news: '资讯',
  comment: '留言',
  user: '用户',
  task: '任务',
}

export const MODERATION_REPORT_RESOLVE_ACTION_LABELS: Record<
  CommunityModerationReportResolveInput['action'],
  string
> = {
  suspend_resource: '下架资源',
  suspend_and_ban_author: '下架并封禁作者',
  ban_user: '封禁用户',
  delete_comment: '删除留言',
  cancel_task: '取消任务',
  dismiss_report: '驳回举报',
}

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

export type ModerationTab = keyof typeof MODERATION_TAB_LABELS

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
