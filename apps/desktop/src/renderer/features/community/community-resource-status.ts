import type { CommunityResourceStatus, CommunityTaskStatus } from '@toolman/shared'

import type { TranslateFn } from '../../i18n/I18nProvider'
import {
  buildCommunityResourcePublishSuccessMessage,
  buildCommunityTaskPublishSuccessMessage,
  getCommunityResourceStatusLabel,
} from '../../i18n/community-status-labels'

/** @deprecated Use getCommunityResourceStatusLabel with i18n instead. */
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
  t: TranslateFn,
): string {
  return buildCommunityResourcePublishSuccessMessage(status, requireReview, t)
}

export function getResourceUserCenterStatusLabel(
  status: CommunityResourceStatus,
  t: TranslateFn,
): string {
  return getCommunityResourceStatusLabel(status, t)
}

export function buildTaskPublishSuccessMessage(
  status: CommunityTaskStatus,
  requireReview: boolean,
  t: TranslateFn,
): string {
  return buildCommunityTaskPublishSuccessMessage(status, requireReview, t)
}
