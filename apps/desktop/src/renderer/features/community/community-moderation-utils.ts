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

export const MODERATION_TAB_LABELS = {
  reports: '举报队列',
  resources: '在线资源',
  pending: '待审核',
  messages: '留言',
  tasks: '任务',
  adminList: '管理员名单',
  adminAppoint: '管理员任命',
  logs: '处置日志',
} as const

export type ModerationTab = keyof typeof MODERATION_TAB_LABELS

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
