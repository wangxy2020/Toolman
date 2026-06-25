import type { CommunityModerationReportResolveInput, CommunityReportReason, CommunityReportTargetType } from '@toolman/shared'

import type { TranslateFn } from './I18nProvider'

export function getModerationCategoryLabels(t: TranslateFn) {
  return {
    resources: t('communityPage.admin.categories.resources'),
    review: t('communityPage.admin.categories.review'),
    online: t('communityPage.admin.categories.online'),
    admin: t('communityPage.admin.categories.admin'),
    logs: t('communityPage.admin.categories.logs'),
  } as const
}

export function getResourceSubTabLabels(t: TranslateFn) {
  return {
    messages: t('communityPage.admin.subTabs.messages'),
    knowledge: t('communityPage.admin.subTabs.knowledge'),
    mcp: t('communityPage.admin.subTabs.mcp'),
    skill: t('communityPage.admin.subTabs.skill'),
    workflow: t('communityPage.admin.subTabs.workflow'),
    tasks: t('communityPage.admin.subTabs.tasks'),
  } as const
}

export function getReviewSubTabLabels(t: TranslateFn) {
  return {
    pending: t('communityPage.admin.reviewSubTabs.pending'),
    reports: t('communityPage.admin.reviewSubTabs.reports'),
  } as const
}

export function getOnlineSubTabLabels(t: TranslateFn) {
  return {
    desktop: t('communityPage.admin.onlineSubTabs.desktop'),
    mobile: t('communityPage.admin.onlineSubTabs.mobile'),
  } as const
}

export function getAdminSubTabLabels(t: TranslateFn) {
  return {
    registeredUsers: t('communityPage.admin.adminSubTabs.registeredUsers'),
    admins: t('communityPage.admin.adminSubTabs.admins'),
    blacklist: t('communityPage.admin.adminSubTabs.blacklist'),
  } as const
}

export function getModerationTargetTypeLabels(t: TranslateFn): Record<CommunityReportTargetType, string> {
  return {
    resource: t('communityPage.admin.reportTargets.resource'),
    news: t('communityPage.admin.reportTargets.news'),
    comment: t('communityPage.admin.reportTargets.comment'),
    user: t('communityPage.admin.reportTargets.user'),
    task: t('communityPage.admin.reportTargets.task'),
  }
}

export function getModerationReportReasonLabels(t: TranslateFn): Record<CommunityReportReason, string> {
  return {
    spam: t('communityPage.admin.reportReasons.spam'),
    illegal: t('communityPage.admin.reportReasons.illegal'),
    copyright: t('communityPage.admin.reportReasons.copyright'),
    other: t('communityPage.admin.reportReasons.other'),
  }
}

export function getModerationReportResolveActionLabels(
  t: TranslateFn,
): Record<CommunityModerationReportResolveInput['action'], string> {
  return {
    suspend_resource: t('communityPage.admin.reportActions.suspend_resource'),
    suspend_and_ban_author: t('communityPage.admin.reportActions.suspend_and_ban_author'),
    ban_user: t('communityPage.admin.reportActions.ban_user'),
    delete_comment: t('communityPage.admin.reportActions.delete_comment'),
    cancel_task: t('communityPage.admin.reportActions.cancel_task'),
    dismiss_report: t('communityPage.admin.reportActions.dismiss_report'),
  }
}
