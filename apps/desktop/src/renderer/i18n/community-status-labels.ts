import type {
  CommunityResourceStatus,
  CommunityResourceType,
  CommunityTaskStatus,
  CommunityTaskType,
} from '@toolman/shared'

import type { AppLanguage } from '../features/settings/app-settings'
import type { TranslateFn } from './I18nProvider'

export function getCommunityResourceStatusLabel(
  status: CommunityResourceStatus,
  t: TranslateFn,
): string {
  if (status === 'draft') {
    return t('communityPage.resourceStatus.draftIncomplete')
  }
  return t(`communityPage.resourceStatus.${status}`)
}

export function getCommunityTaskStatusLabel(
  status: CommunityTaskStatus,
  t: TranslateFn,
): string {
  return t(`communityPage.taskStatus.${status}`)
}

export function getCommunityTaskTypeLabel(type: CommunityTaskType, t: TranslateFn): string {
  return t(`communityPage.taskTypes.${type}`)
}

export function getCommunityInstallStatusLabel(
  status: 'pending' | 'success' | 'failed' | 'rolled_back',
  t: TranslateFn,
): string {
  return t(`communityPage.installStatus.${status}`)
}

export function getCommunityResourceTypeLabel(
  type: CommunityResourceType,
  t: TranslateFn,
): string {
  return t(`communityPage.mine.resourceTypes.${type}`)
}

export function buildCommunityResourcePublishSuccessMessage(
  status: CommunityResourceStatus,
  requireReview: boolean,
  t: TranslateFn,
): string {
  if (status === 'pending_review' || (requireReview && status !== 'published')) {
    return t('communityPage.publishMessages.resourcePending')
  }
  return t('communityPage.publishMessages.resourcePublished')
}

export function buildCommunityTaskPublishSuccessMessage(
  status: CommunityTaskStatus,
  requireReview: boolean,
  t: TranslateFn,
): string {
  if (status === 'pending_review' || (requireReview && status !== 'open')) {
    return t('communityPage.publishMessages.taskPending')
  }
  return t('communityPage.publishMessages.taskPublished')
}

export function formatCommunityTaskBudget(
  amount: number,
  currency: string,
  t: TranslateFn,
  language: AppLanguage = 'zh-CN',
): string {
  if (amount <= 0) return t('communityPage.budgetNegotiable')
  const locale = language === 'en' ? 'en-US' : 'zh-CN'
  return `${amount.toLocaleString(locale)} ${currency}`
}
