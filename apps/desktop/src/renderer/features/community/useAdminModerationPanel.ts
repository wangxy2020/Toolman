import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  type CommunityHubHealthOutput,
  type CommunityModerationScanDevice,
} from '@toolman/shared'

import { executeAdminModerationPendingAction } from './admin-moderation-panel-actions'
import type { BlacklistEntry, PendingAction } from './admin-moderation-panel-types'
import { getCommunityHubHealth } from './community-api.client'
import { formatCommunityDate } from './community-market-utils'
import {
  type ModerationCategory,
  type ModerationSubTab,
} from './community-moderation-utils'
import {
  isCommunityFounder,
  isCommunityModerator,
} from './community-user-utils'
import { useCommunityModerationCategory } from './community-moderation-category-context'
import { useCommunityAdminManagement } from './useCommunityAdminManagement'
import { useCommunityModeration } from './useCommunityModeration'
import { useCommunityUser } from './useCommunityUser'
import { useAdminModerationPanelStats } from './useAdminModerationPanelStats'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from '../../components/module-page-status'
import {
  getModerationCategoryLabels,
  getResourceSubTabLabels,
  getModerationTargetTypeLabels,
  getModerationReportReasonLabels,
  getModerationReportResolveActionLabels,
} from '../../i18n/community-moderation-labels'
import { useI18n } from '../../i18n/useI18n'

export function useAdminModerationPanel() {
  const { t, language } = useI18n()
  const moderationCategoryLabels = useMemo(() => getModerationCategoryLabels(t), [t])
  const resourceSubTabLabels = useMemo(() => getResourceSubTabLabels(t), [t])
  const reportTargetLabels = useMemo(() => getModerationTargetTypeLabels(t), [t])
  const reportReasonLabels = useMemo(() => getModerationReportReasonLabels(t), [t])
  const reportActionLabels = useMemo(() => getModerationReportResolveActionLabels(t), [t])
  const user = useCommunityUser()
  const isModerator = isCommunityModerator(user.profile?.role)
  const isFounder = isCommunityFounder(user.profile?.role)
  const moderation = useCommunityModeration({ autoScan: isModerator, enabled: isModerator })
  const adminManagement = useCommunityAdminManagement({
    canViewList: isModerator,
    canManage: isFounder,
  })
  const { category, subTab, setSubTab, setPendingReviewCount } = useCommunityModerationCategory()
  const [hubHealth, setHubHealth] = useState<CommunityHubHealthOutput | null>(null)
  const [hubHealthError, setHubHealthError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [adminSearch, setAdminSearch] = useState('')
  const [deviceSearch, setDeviceSearch] = useState('')

  const loadHubHealth = useCallback(async () => {
    try {
      const health = await getCommunityHubHealth()
      setHubHealth(health)
      setHubHealthError(null)
    } catch (error) {
      setHubHealth(null)
      setHubHealthError(error instanceof Error ? error.message : t('communityPage.admin.hubHealthFailed'))
    }
  }, [t])

  useEffect(() => {
    if (!isModerator) return
    void loadHubHealth()
  }, [isModerator, loadHubHealth, moderation.scan?.scannedAt])

  useEffect(() => {
    setDeviceSearch('')
  }, [category])

  const handleRefresh = () => {
    void moderation.refresh()
    void loadHubHealth()
  }

  const scan = moderation.scan

  useEffect(() => {
    setPendingReviewCount(scan?.pendingReviewCount ?? 0)
  }, [scan, setPendingReviewCount])

  const blacklistCount = useMemo(() => {
    if (!scan) return 0
    return scan.bannedUsers.length + scan.bannedDevices.length
  }, [scan])

  const blacklistEntries = useMemo<BlacklistEntry[]>(() => {
    if (!scan) return []

    const users: BlacklistEntry[] = scan.bannedUsers.map((entry) => ({
      kind: 'user',
      key: `user-${entry.userId}`,
      userName: entry.displayName,
      deviceId: '—',
      userId: entry.userId,
    }))

    const devices: BlacklistEntry[] = scan.bannedDevices.map((entry) => ({
      kind: 'device',
      key: `device-${entry.deviceId}`,
      userName: entry.userName,
      deviceId: entry.deviceId,
      deviceRecordId: entry.deviceId,
    }))

    return [...users, ...devices]
  }, [scan])

  const onlineDevices = useMemo<CommunityModerationScanDevice[]>(() => {
    if (!scan) return []
    return [...scan.onlineDesktopDevices, ...scan.onlineMobileDevices].sort(
      (a, b) => b.lastSeenAt - a.lastSeenAt,
    )
  }, [scan])

  const filteredDevicesByKind = useMemo(() => {
    const query = deviceSearch.trim().toLowerCase()
    const source =
      category === 'online' && subTab === 'mobile'
        ? (scan?.onlineMobileDevices ?? [])
        : category === 'online'
          ? (scan?.onlineDesktopDevices ?? [])
          : onlineDevices

    if (!query) return source

    return source.filter((device) => {
      const haystack = [
        device.deviceName,
        device.userName,
        device.deviceId,
        device.userId,
        device.deviceKind === 'mobile' ? t('communityPage.admin.mobile') : t('communityPage.admin.desktop'),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [category, deviceSearch, onlineDevices, scan, subTab, t])

  const { categoryStatCards, activeListCount } = useAdminModerationPanelStats({
    t,
    category: category as ModerationCategory,
    subTab: subTab as ModerationSubTab,
    scan,
    hubHealth,
    adminManagement,
    blacklistCount,
    blacklistEntries,
    filteredDevicesByKind,
    adminSearch,
    moderation,
  })

  const scannedAtLabel = useMemo(() => {
    if (!scan) return t('communityPage.admin.neverScanned')
    return formatCommunityDate(scan.scannedAt, language)
  }, [language, scan, t])

  const errorMessages = useMemo(() => {
    const messages = [
      moderation.error,
      moderation.scanError,
      adminManagement.error,
      hubHealthError,
    ].filter((message): message is string => Boolean(message))
    return [...new Set(messages)]
  }, [adminManagement.error, hubHealthError, moderation.error, moderation.scanError])

  useRegisterModulePanelError('community-moderation', errorMessages[0] ?? null)
  useRegisterModulePanelStatus(
    'community-moderation-loading',
    moderation.loading ? { tone: 'info', message: t('communityPage.admin.loadingData') } : null,
  )
  useRegisterModulePanelStatus(
    'community-moderation-acting',
    moderation.acting ? { tone: 'info', message: t('communityPage.admin.acting') } : null,
  )

  const handleConfirm = async () => {
    if (!pending) return

    try {
      await executeAdminModerationPendingAction(pending, moderation, adminManagement)
      setPending(null)
    } catch {
      // error surfaced via moderation.error
    }
  }

  return {
    t,
    language,
    isModerator,
    isFounder,
    user,
    moderation,
    adminManagement,
    category: category as ModerationCategory,
    subTab: subTab as ModerationSubTab,
    setSubTab,
    hubHealth,
    hubHealthError,
    pending,
    setPending,
    adminSearch,
    setAdminSearch,
    deviceSearch,
    setDeviceSearch,
    scan,
    categoryStatCards,
    activeListCount,
    scannedAtLabel,
    handleRefresh,
    handleConfirm,
    moderationCategoryLabels,
    resourceSubTabLabels,
    reportTargetLabels,
    reportReasonLabels,
    reportActionLabels,
    blacklistEntries,
    filteredDevicesByKind,
    profileRole: user.profile?.role,
  }
}

export type AdminModerationPanelState = ReturnType<typeof useAdminModerationPanel>
