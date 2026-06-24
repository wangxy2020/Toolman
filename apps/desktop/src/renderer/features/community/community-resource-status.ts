import type { CommunityResourceStatus, CommunityTaskStatus } from '@toolman/shared'

export const RESOURCE_STATUS_LABELS: Record<CommunityResourceStatus, string> = {
  draft: '草稿',
  pending_review: '待审核',
  published: '已发布',
  rejected: '已拒绝',
  suspended: '已下架',
  archived: '已归档',
}

export function buildResourcePublishSuccessMessage(
  status: CommunityResourceStatus,
  requireReview: boolean,
): string {
  if (status === 'pending_review' || (requireReview && status !== 'published')) {
    return '已提交审核，管理员通过后将出现在市场中。可在「我的 → 发布」查看进度。'
  }
  return '发布成功，资源已上架。'
}

/** Shown in「我的」— draft means package upload / publish step did not complete. */
export function getResourceUserCenterStatusLabel(status: CommunityResourceStatus): string {
  if (status === 'draft') {
    return '草稿（资源包未上传，未进入审核）'
  }
  return RESOURCE_STATUS_LABELS[status]
}

export function buildTaskPublishSuccessMessage(
  status: CommunityTaskStatus,
  requireReview: boolean,
): string {
  if (status === 'pending_review' || (requireReview && status !== 'open')) {
    return '已提交审核，管理员通过后将出现在任务市场中。可在「我的 → 任务」查看进度。'
  }
  return '发布成功，任务已开放申请。'
}
