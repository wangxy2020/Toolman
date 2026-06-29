import { useMemo } from 'react'

import { type CommunityModerationScanDevice } from '@toolman/shared'

import type { BlacklistEntry } from './admin-moderation-panel-types'
import {
  filterResourcesByType,
  isAdminSubTab,
  isOnlineSubTab,
  isResourceSubTab,
  isReviewSubTab,
} from './admin-moderation-panel-utils'
import type { ModerationCategory, ModerationSubTab } from './community-moderation-utils'
import type { useCommunityAdminManagement } from './useCommunityAdminManagement'
import type { useCommunityModeration } from './useCommunityModeration'
import { useI18n } from '../../i18n/useI18n'
import {
  getAdminSubTabLabels,
  getOnlineSubTabLabels,
  getResourceSubTabLabels,
  getReviewSubTabLabels,
} from '../../i18n/community-moderation-labels'

type Translate = ReturnType<typeof useI18n>['t']

export function useAdminModerationPanelStats({
  t,
  category,
  subTab,
  scan,
  hubHealth,
  adminManagement,
  blacklistCount,
  blacklistEntries,
  filteredDevicesByKind,
  adminSearch,
  moderation,
}: {
  t: Translate
  category: ModerationCategory
  subTab: ModerationSubTab
  scan: ReturnType<typeof useCommunityModeration>['scan']
  hubHealth: { userCount?: number } | null
  adminManagement: ReturnType<typeof useCommunityAdminManagement>
  blacklistCount: number
  blacklistEntries: BlacklistEntry[]
  filteredDevicesByKind: CommunityModerationScanDevice[]
  adminSearch: string
  moderation: ReturnType<typeof useCommunityModeration>
}) {
  const resourceSubTabLabels = useMemo(() => getResourceSubTabLabels(t), [t])
  const reviewSubTabLabels = useMemo(() => getReviewSubTabLabels(t), [t])
  const onlineSubTabLabels = useMemo(() => getOnlineSubTabLabels(t), [t])
  const adminSubTabLabels = useMemo(() => getAdminSubTabLabels(t), [t])

  const categoryStatCards = useMemo(() => {
    switch (category) {
      case 'resources':
        return [
          { key: 'messages' as const, label: resourceSubTabLabels.messages, count: scan?.boardMessageCount ?? 0 },
          { key: 'knowledge' as const, label: resourceSubTabLabels.knowledge, count: scan?.onlineKnowledgeCount ?? 0 },
          { key: 'mcp' as const, label: resourceSubTabLabels.mcp, count: scan?.onlineMcpCount ?? 0 },
          { key: 'skill' as const, label: resourceSubTabLabels.skill, count: scan?.onlineSkillCount ?? 0 },
          { key: 'workflow' as const, label: resourceSubTabLabels.workflow, count: scan?.onlineWorkflowCount ?? 0 },
          { key: 'tasks' as const, label: resourceSubTabLabels.tasks, count: scan?.activeTaskCount ?? 0 },
        ]
      case 'review':
        return [
          { key: 'pending' as const, label: reviewSubTabLabels.pending, count: scan?.pendingReviewCount ?? 0 },
          { key: 'reports' as const, label: reviewSubTabLabels.reports, count: scan?.openReportCount ?? 0 },
        ]
      case 'online':
        return [
          { key: 'desktop' as const, label: onlineSubTabLabels.desktop, count: scan?.onlineDesktopDeviceCount ?? 0 },
          { key: 'mobile' as const, label: onlineSubTabLabels.mobile, count: scan?.onlineMobileDeviceCount ?? 0 },
        ]
      case 'admin':
        return [
          {
            key: 'registeredUsers' as const,
            label: adminSubTabLabels.registeredUsers,
            count: hubHealth?.userCount ?? 0,
          },
          {
            key: 'admins' as const,
            label: adminSubTabLabels.admins,
            count: adminManagement.moderators.length,
          },
          {
            key: 'blacklist' as const,
            label: adminSubTabLabels.blacklist,
            count: blacklistCount,
          },
        ]
      case 'logs':
        return [{ key: 'logs' as const, label: t('communityPage.admin.logs'), count: moderation.logs.length }]
    }
  }, [
    adminManagement.moderators.length,
    blacklistCount,
    category,
    hubHealth?.userCount,
    moderation.logs.length,
    resourceSubTabLabels,
    reviewSubTabLabels,
    onlineSubTabLabels,
    adminSubTabLabels,
    t,
    scan,
  ])

  const activeListCount = useMemo(() => {
    if (category === 'resources' && isResourceSubTab(subTab)) {
      if (subTab === 'tasks') return scan?.activeTasks.length ?? 0
      if (subTab === 'messages') return scan?.recentMessages.length ?? 0
      return filterResourcesByType(scan?.onlineResources ?? [], subTab).length
    }
    if (category === 'review' && isReviewSubTab(subTab)) {
      if (subTab === 'pending') {
        return (scan?.pendingReview.length ?? 0) + (scan?.pendingReviewTasks.length ?? 0)
      }
      return scan?.openReports.length ?? 0
    }
    if (category === 'online' && isOnlineSubTab(subTab)) return filteredDevicesByKind.length
    if (category === 'admin' && isAdminSubTab(subTab)) {
      if (subTab === 'registeredUsers') return hubHealth?.userCount ?? 0
      if (subTab === 'admins') {
        return adminSearch.trim()
          ? adminManagement.searchResults.length
          : adminManagement.moderators.length
      }
      return blacklistEntries.length
    }
    if (category === 'logs') return moderation.logs.length
    return 0
  }, [
    adminManagement.moderators.length,
    adminManagement.searchResults.length,
    adminSearch,
    blacklistEntries.length,
    category,
    filteredDevicesByKind.length,
    hubHealth?.userCount,
    moderation.logs.length,
    scan,
    subTab,
  ])

  return { categoryStatCards, activeListCount }
}
