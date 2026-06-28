import type { CommunityResourceStatus, CommunityTaskStatus } from '@toolman/shared'

import type { TranslateFn } from '../../i18n/I18nProvider'
import {
  buildCommunityResourcePublishSuccessMessage,
  buildCommunityTaskPublishSuccessMessage,
  getCommunityResourceStatusLabel,
} from '../../i18n/community-status-labels'

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
