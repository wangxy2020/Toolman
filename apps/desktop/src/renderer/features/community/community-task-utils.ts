import {
  type CommunityTaskStatus,
  type CommunityTaskType,
} from '@toolman/shared'

import type { AppLanguage } from '../settings/app-settings'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { formatCommunityTaskBudget } from '../../i18n/community-status-labels'

export const TASK_TYPE_LABELS: Record<CommunityTaskType, string> = {
  development: '开发',
  design: '设计',
  translation: '翻译',
  tender: '招标',
  other: '其他',
}

export const TASK_STATUS_LABELS: Record<CommunityTaskStatus, string> = {
  draft: '草稿',
  pending_review: '待审核',
  open: '开放中',
  assigned: '已指派',
  in_progress: '进行中',
  delivered: '已交付',
  completed: '已完成',
  rejected: '已拒绝',
  cancelled: '已取消',
  disputed: '争议中',
}

export function formatTaskBudget(
  amount: number,
  currency: string,
  t: TranslateFn,
  language: AppLanguage = 'zh-CN',
): string {
  return formatCommunityTaskBudget(amount, currency, t, language)
}

export function parseTaskTags(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}
