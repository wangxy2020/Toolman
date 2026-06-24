import type { CommunityResourceItem, CommunityTaskItem } from '@toolman/shared'

import { getResourceUserCenterStatusLabel } from './community-resource-status'
import { TASK_STATUS_LABELS } from './community-task-utils'

export function isTaskRejectedLike(task: CommunityTaskItem): boolean {
  return task.status === 'rejected'
}

export function isResourceRejectedLike(item: CommunityResourceItem): boolean {
  return item.status === 'rejected'
}

/** 审核退回后允许修改 / 重新提交 / 删除（含 legacy 状态） */
export function canModerationResubmitTask(task: CommunityTaskItem): boolean {
  return task.status === 'rejected' || task.status === 'cancelled'
}

export function canModerationResubmitResource(item: CommunityResourceItem): boolean {
  if (item.status === 'rejected') return true
  // 旧数据或未迁移行：审核拒绝后可能被标为 suspended 且从未上架
  if (
    item.status === 'suspended' &&
    item.downloadCount === 0 &&
    item.installCount === 0
  ) {
    return true
  }
  return false
}

export function getTaskUserCenterStatusLabel(task: CommunityTaskItem): string {
  return TASK_STATUS_LABELS[task.status]
}

export function getResourceUserCenterDisplayStatusLabel(item: CommunityResourceItem): string {
  return getResourceUserCenterStatusLabel(item.status)
}

export function canWithdrawCommunityTask(task: CommunityTaskItem): boolean {
  return task.status === 'pending_review'
}

export function canDeleteCommunityTaskFromUserCenter(task: CommunityTaskItem): boolean {
  return (
    task.status === 'draft' ||
    task.status === 'pending_review' ||
    task.status === 'rejected' ||
    task.status === 'cancelled' ||
    (task.status === 'open' && !task.assigneeId)
  )
}

export function canDeleteCommunityResourceFromUserCenter(item: CommunityResourceItem): boolean {
  return (
    item.status === 'draft' ||
    item.status === 'pending_review' ||
    item.status === 'published' ||
    item.status === 'rejected' ||
    item.status === 'suspended'
  )
}
