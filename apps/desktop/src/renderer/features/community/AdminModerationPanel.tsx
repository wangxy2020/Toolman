import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  type CommunityHubHealthOutput,
  type CommunityModerationReport,
  type CommunityModerationReportResolveInput,
  type CommunityModerationScanDevice,
  type CommunityModerationScanResource,
  type CommunityResourceType,
} from '@toolman/shared'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CommunityPanelHeader, CommunityPanelRefreshButton } from './CommunityPanelHeader'
import { getCommunityHubHealth } from './community-api.client'
import { formatCommunityDate } from './community-market-utils'
import { formatBoardMessageTitle, formatNewsPreview } from './community-news-utils'
import {
  getDefaultReportResolveAction,
  type AdminSubTab,
  type ModerationSubTab,
  type OnlineSubTab,
  type ResourceSubTab,
  type ReviewSubTab,
} from './community-moderation-utils'
import {
  isCommunityFounder,
  isCommunityModerator,
} from './community-user-utils'
import { useCommunityModerationCategory } from './community-moderation-category-context'
import { useCommunityAdminManagement } from './useCommunityAdminManagement'
import { useCommunityModeration } from './useCommunityModeration'
import { useCommunityUser } from './useCommunityUser'
import { ModerationReviewQueue } from './ModerationReviewQueue'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from '../../components/module-page-status'
import {
  getModerationLogActionLabel,
  getModerationLogTargetTypeLabel,
  getCommunityUserRoleLabel,
} from '../../i18n/community-user-labels'
import { getModerationCategoryLabels, getResourceSubTabLabels, getReviewSubTabLabels, getOnlineSubTabLabels, getAdminSubTabLabels, getModerationTargetTypeLabels, getModerationReportReasonLabels, getModerationReportResolveActionLabels } from '../../i18n/community-moderation-labels'
import { useI18n } from '../../i18n/useI18n'

type PendingAction =
  | {
      kind: 'suspend-resource'
      resourceId: string
      title: string
      reviewReject?: boolean
    }
  | {
      kind: 'ban-user'
      userId: string
      label: string
    }
  | {
      kind: 'resolve-report'
      report: CommunityModerationReport
      action: CommunityModerationReportResolveInput['action']
    }
  | {
      kind: 'ban-device'
      deviceId: string
      userId: string
      deviceName: string
      userName: string
    }
  | {
      kind: 'delete-message'
      messageId: string
      preview: string
    }
  | {
      kind: 'cancel-task'
      taskId: string
      title: string
      reviewReject?: boolean
    }
  | {
      kind: 'approve-resource'
      resourceId: string
      title: string
    }
  | {
      kind: 'approve-task'
      taskId: string
      title: string
    }
  | {
      kind: 'appoint-admin'
      userId: string
      label: string
    }
  | {
      kind: 'revoke-admin'
      userId: string
      label: string
    }
  | {
      kind: 'unban-user'
      userId: string
      label: string
    }
  | {
      kind: 'unban-device'
      deviceId: string
      label: string
    }

type BlacklistEntry =
  | {
      kind: 'user'
      key: string
      userName: string
      deviceId: string
      userId: string
    }
  | {
      kind: 'device'
      key: string
      userName: string
      deviceId: string
      deviceRecordId: string
    }

function isReviewSubTab(subTab: ModerationSubTab): subTab is ReviewSubTab {
  return subTab === 'pending' || subTab === 'reports'
}

function isResourceSubTab(subTab: ModerationSubTab): subTab is ResourceSubTab {
  return (
    subTab === 'messages' ||
    subTab === 'knowledge' ||
    subTab === 'mcp' ||
    subTab === 'skill' ||
    subTab === 'workflow' ||
    subTab === 'tasks'
  )
}

function isOnlineSubTab(subTab: ModerationSubTab): subTab is OnlineSubTab {
  return subTab === 'desktop' || subTab === 'mobile'
}

function isAdminSubTab(subTab: ModerationSubTab): subTab is AdminSubTab {
  return subTab === 'registeredUsers' || subTab === 'admins' || subTab === 'blacklist'
}

function filterResourcesByType(
  resources: CommunityModerationScanResource[],
  resourceType: CommunityResourceType,
) {
  return resources.filter((resource) => resource.resourceType === resourceType)
}

export function AdminModerationPanel() {
  const { t, language } = useI18n()
  const resourceSubTabLabels = useMemo(() => getResourceSubTabLabels(t), [t])
  const reviewSubTabLabels = useMemo(() => getReviewSubTabLabels(t), [t])
  const onlineSubTabLabels = useMemo(() => getOnlineSubTabLabels(t), [t])
  const adminSubTabLabels = useMemo(() => getAdminSubTabLabels(t), [t])
  const reportTargetLabels = useMemo(() => getModerationTargetTypeLabels(t), [t])
  const reportReasonLabels = useMemo(() => getModerationReportReasonLabels(t), [t])
  const reportActionLabels = useMemo(() => getModerationReportResolveActionLabels(t), [t])
  const moderationCategoryLabels = useMemo(() => getModerationCategoryLabels(t), [t])
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
  }, [])

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
  }, [category, deviceSearch, onlineDevices, scan, subTab])

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

  if (!isModerator) {
    return (
      <div className="tm-community-market tm-community-user-center">
        <CommunityPanelHeader
          title={t('communityPage.panels.management.title')}
          subtitle={t('communityPage.panels.management.subtitle')}
        />
        <div className="tm-user-center-feed">
          <div className="tm-user-center-empty">{t('communityPage.admin.needPermission')}</div>
        </div>
      </div>
    )
  }

  const handleConfirm = async () => {
    if (!pending) return

    try {
      switch (pending.kind) {
        case 'suspend-resource':
          await moderation.suspendResource(pending.resourceId, '管理员审核拒绝')
          break
        case 'ban-user':
          await moderation.banUser(pending.userId, '管理员封禁恶意用户', 168)
          break
        case 'ban-device':
          await moderation.banDevice({
            deviceId: pending.deviceId,
            userId: pending.userId,
            deviceName: pending.deviceName,
            reason: '管理员封禁设备',
            durationHours: 168,
          })
          break
        case 'resolve-report':
          await moderation.resolveReport(pending.report.id, pending.action, '管理员处理举报')
          break
        case 'delete-message':
          await moderation.deleteMessage(pending.messageId)
          break
        case 'cancel-task':
          if (pending.reviewReject) {
            await moderation.rejectTask(pending.taskId, '管理员审核拒绝')
          } else {
            await moderation.cancelTask(pending.taskId)
          }
          break
        case 'approve-resource':
          await moderation.approveResource(pending.resourceId, '管理员审核通过')
          break
        case 'approve-task':
          await moderation.approveTask(pending.taskId, '管理员审核通过')
          break
        case 'appoint-admin':
          await adminManagement.appointAdmin(pending.userId)
          break
        case 'revoke-admin':
          await adminManagement.revokeAdmin(pending.userId)
          break
        case 'unban-user':
          await moderation.unbanUser(pending.userId)
          break
        case 'unban-device':
          await moderation.unbanDevice(pending.deviceId)
          break
      }
      setPending(null)
    } catch {
      // error surfaced via moderation.error
    }
  }

  const confirmDialog = pending
    ? buildConfirmDialog(pending, () => setPending(null), handleConfirm, t, reportActionLabels)
    : null

  const profileRole = user.profile?.role

  return (
    <div className="tm-community-market tm-community-user-center">
      <div className="tm-user-center-overview">
        <CommunityPanelHeader
          title={t('communityPage.panels.management.title')}
          subtitle={isFounder ? t('communityPage.admin.founderConsole') : t('communityPage.admin.adminConsole')}
          titleExtra={
            profileRole ? (
              <span className="tm-user-center-role-badge">
                {getCommunityUserRoleLabel(profileRole, t)}
              </span>
            ) : null
          }
          actions={
            <CommunityPanelRefreshButton
              title={t('communityPage.admin.scanNow')}
              loading={moderation.loading}
              disabled={moderation.loading || moderation.acting}
              onClick={handleRefresh}
            />
          }
        />

        <div
          className="tm-user-center-stat-grid"
          style={{ ['--tm-stat-cols' as string]: categoryStatCards.length }}
          role="tablist"
          aria-label={`${moderationCategoryLabels[category]}${t('communityPage.admin.dataSectionSuffix')}`}
        >
          {categoryStatCards.map((item) => {
            const active = subTab === item.key
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={[
                  'tm-user-center-stat-card',
                  active ? 'tm-user-center-stat-card--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSubTab(item.key)}
              >
                <span className="tm-user-center-stat-label">{item.label}</span>
                <span className="tm-user-center-stat-value">{item.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="tm-user-center-feed">
        <div className="tm-user-center-feed-meta">
          <span>{t('communityPage.admin.listCount', { count: activeListCount })}</span>
          <span>
            {t('communityPage.admin.lastScan', { time: scannedAtLabel })}
            {moderation.loading ? t('communityPage.admin.scanning') : ''}
          </span>
        </div>

        <div className="tm-user-center-feed-body">
        {category === 'resources' && subTab === 'messages' ? (
          <ModerationList
            empty={t('communityPage.admin.emptyMessages')}
            items={scan?.recentMessages ?? []}
            renderItem={(message) => (
              <div key={message.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">
                    {formatBoardMessageTitle(message.body)}
                  </div>
                  <div className="tm-community-moderation-row-meta">
                    {message.authorName} · {formatCommunityDate(message.createdAt, language)}
                  </div>
                  <div className="tm-community-moderation-row-desc">{formatNewsPreview(message.body)}</div>
                </div>
                <div className="tm-community-moderation-row-actions">
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                    disabled={moderation.acting}
                    onClick={() =>
                      setPending({
                        kind: 'delete-message',
                        messageId: message.id,
                        preview: formatBoardMessageTitle(message.body),
                      })
                    }
                  >
                    {t('communityPage.admin.delete')}
                  </button>
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                    disabled={moderation.acting}
                    onClick={() =>
                      setPending({
                        kind: 'ban-user',
                        userId: message.userId,
                        label: message.authorName,
                      })
                    }
                  >
                    {t('communityPage.admin.banPublisher')}
                  </button>
                </div>
              </div>
            )}
          />
        ) : null}

        {category === 'resources' && isResourceSubTab(subTab) && subTab !== 'tasks' && subTab !== 'messages' ? (
          <ModerationList
            empty={t('communityPage.admin.emptyOnline', { type: resourceSubTabLabels[subTab] })}
            items={filterResourcesByType(scan?.onlineResources ?? [], subTab)}
            renderItem={(resource) => (
              <div key={resource.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">{resource.title}</div>
                  <div className="tm-community-moderation-row-meta">
                    {resource.resourceType} · {resource.status} · {resource.authorName} ·{' '}
                    {formatCommunityDate(resource.createdAt, language)}
                  </div>
                </div>
                <div className="tm-community-moderation-row-actions">
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                    disabled={moderation.acting}
                    onClick={() =>
                      setPending({
                        kind: 'suspend-resource',
                        resourceId: resource.id,
                        title: resource.title,
                      })
                    }
                  >
                    {t('communityPage.admin.delist')}
                  </button>
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                    disabled={moderation.acting}
                    onClick={() =>
                      setPending({
                        kind: 'ban-user',
                        userId: resource.authorId,
                        label: resource.authorName,
                      })
                    }
                  >
                    {t('communityPage.admin.banPublisher')}
                  </button>
                </div>
              </div>
            )}
          />
        ) : null}

        {category === 'review' && subTab === 'pending' ? (
          <ModerationReviewQueue
            resources={scan?.pendingReview ?? []}
            tasks={scan?.pendingReviewTasks ?? []}
            acting={moderation.acting}
            onApproveResource={(resource) =>
              setPending({
                kind: 'approve-resource',
                resourceId: resource.id,
                title: resource.title,
              })
            }
            onRejectResource={(resource) =>
              setPending({
                kind: 'suspend-resource',
                resourceId: resource.id,
                title: resource.title,
                reviewReject: true,
              })
            }
            onApproveTask={(task) =>
              setPending({
                kind: 'approve-task',
                taskId: task.id,
                title: task.title,
              })
            }
            onRejectTask={(task) =>
              setPending({
                kind: 'cancel-task',
                taskId: task.id,
                title: task.title,
                reviewReject: true,
              })
            }
          />
        ) : null}

        {category === 'review' && subTab === 'reports' ? (
          <ModerationList
            empty={t('communityPage.admin.emptyReports')}
            items={scan?.openReports ?? []}
            renderItem={(report) => {
              const defaultAction = getDefaultReportResolveAction(report.targetType)
              return (
                <div key={report.id} className="tm-community-moderation-row">
                  <div className="tm-community-moderation-row-main">
                    <div className="tm-community-moderation-row-title">
                      {reportTargetLabels[report.targetType]} · {reportReasonLabels[report.reason]}
                    </div>
                    <div className="tm-community-moderation-row-meta">
                      {t('communityPage.admin.targetId', {
                        id: report.targetId,
                        time: formatCommunityDate(report.createdAt, language),
                      })}
                    </div>
                    {report.description.trim() ? (
                      <div className="tm-community-moderation-row-meta">{report.description}</div>
                    ) : null}
                  </div>
                  <div className="tm-community-moderation-row-actions">
                    <button
                      type="button"
                      className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                      disabled={moderation.acting}
                      onClick={() =>
                        setPending({
                          kind: 'resolve-report',
                          report,
                          action: defaultAction,
                        })
                      }
                    >
                      {reportActionLabels[defaultAction]}
                    </button>
                    <button
                      type="button"
                      className="tm-btn tm-btn--ghost"
                      disabled={moderation.acting}
                      onClick={() =>
                        setPending({
                          kind: 'resolve-report',
                          report,
                          action: 'dismiss_report',
                        })
                      }
                    >
                      {t('communityPage.admin.reject')}
                    </button>
                  </div>
                </div>
              )
            }}
          />
        ) : null}

        {category === 'resources' && subTab === 'tasks' ? (
          <ModerationList
            empty={t('communityPage.admin.emptyTasks')}
            items={scan?.activeTasks ?? []}
            renderItem={(task) => (
              <div key={task.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">{task.title}</div>
                  <div className="tm-community-moderation-row-meta">
                    {task.status} · {task.publisherName} · {formatCommunityDate(task.createdAt, language)}
                  </div>
                </div>
                <div className="tm-community-moderation-row-actions">
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                    disabled={moderation.acting}
                    onClick={() =>
                      setPending({
                        kind: 'cancel-task',
                        taskId: task.id,
                        title: task.title,
                      })
                    }
                  >
                    {t('communityPage.admin.cancelTask')}
                  </button>
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                    disabled={moderation.acting}
                    onClick={() =>
                      setPending({
                        kind: 'ban-user',
                        userId: task.publisherId,
                        label: task.publisherName,
                      })
                    }
                  >
                    {t('communityPage.admin.banPublisher')}
                  </button>
                </div>
              </div>
            )}
          />
        ) : null}

        {category === 'admin' && subTab === 'blacklist' ? (
          blacklistEntries.length === 0 ? (
            <div className="tm-user-center-empty">{t('communityPage.admin.emptyBlacklist')}</div>
          ) : (
            <div className="tm-community-moderation-table-wrap">
              <div className="tm-community-moderation-table-head">
                <span>{t('communityPage.admin.columns.index')}</span>
                <span>{t('communityPage.admin.columns.userName')}</span>
                <span>{t('communityPage.admin.columns.deviceId')}</span>
                <span>{t('communityPage.admin.columns.action')}</span>
              </div>
              <div className="tm-community-moderation-table-body">
                {blacklistEntries.map((entry, index) => (
                  <div key={entry.key} className="tm-community-moderation-table-row">
                    <span className="tm-community-moderation-table-index">{index + 1}</span>
                    <span className="tm-community-moderation-table-user" title={entry.userName}>
                      {entry.userName}
                    </span>
                    <span
                      className="tm-community-moderation-table-device"
                      title={entry.deviceId}
                    >
                      {entry.deviceId}
                    </span>
                    <div className="tm-community-moderation-table-actions">
                      <button
                        type="button"
                        className="tm-btn tm-btn--ghost"
                        disabled={moderation.acting}
                        onClick={() =>
                          setPending(
                            entry.kind === 'user'
                              ? {
                                  kind: 'unban-user',
                                  userId: entry.userId,
                                  label: entry.userName,
                                }
                              : {
                                  kind: 'unban-device',
                                  deviceId: entry.deviceRecordId,
                                  label: entry.deviceId,
                                },
                          )
                        }
                      >
                        {t('communityPage.admin.unban')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : null}

        {category === 'online' && isOnlineSubTab(subTab) ? (
          <div className="tm-community-moderation-devices">
            <div className="tm-community-moderation-admin-search">
              <input
                type="search"
                className="tm-community-moderation-admin-search-input"
                placeholder={t('communityPage.admin.searchDevicesPlaceholder')}
                value={deviceSearch}
                onChange={(event) => setDeviceSearch(event.target.value)}
              />
            </div>
            <ModerationList
              empty={
                deviceSearch.trim()
                  ? t('communityPage.admin.noMatchDevices')
                  : subTab === 'mobile'
                    ? t('communityPage.admin.emptyDevices', { kind: t('communityPage.admin.mobile') })
                    : t('communityPage.admin.emptyDevices', { kind: t('communityPage.admin.desktop') })
              }
              items={filteredDevicesByKind}
              renderItem={(device) => (
                <div key={device.deviceId} className="tm-community-moderation-row">
                  <div className="tm-community-moderation-row-main">
                    <div className="tm-community-moderation-row-title">{device.deviceName}</div>
                    <div className="tm-community-moderation-row-meta">
                      {t('communityPage.admin.deviceMeta', {
                        kind:
                          device.deviceKind === 'mobile'
                            ? t('communityPage.admin.mobile')
                            : t('communityPage.admin.desktop'),
                        userName: device.userName,
                        time: formatCommunityDate(device.lastSeenAt, language),
                      })}
                    </div>
                    <div className="tm-community-moderation-row-desc">
                      {t('communityPage.admin.deviceIdLabel', { id: device.deviceId })}
                    </div>
                  </div>
                  <div className="tm-community-moderation-row-actions">
                    <button
                      type="button"
                      className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                      disabled={moderation.acting}
                      onClick={() =>
                        setPending({
                          kind: 'ban-device',
                          deviceId: device.deviceId,
                          userId: device.userId,
                          deviceName: device.deviceName,
                          userName: device.userName,
                        })
                      }
                    >
                      {t('communityPage.admin.banDevice')}
                    </button>
                  </div>
                </div>
              )}
            />
          </div>
        ) : null}

        {category === 'admin' && subTab === 'registeredUsers' ? (
          <div className="tm-user-center-empty">
            {hubHealthError
              ? t('communityPage.admin.registeredUsersError', { error: hubHealthError })
              : t('communityPage.admin.registeredUsers', {
                  count: hubHealth?.userCount ?? '—',
                })}
          </div>
        ) : null}

        {category === 'admin' && subTab === 'admins' && isModerator ? (
          <div className="tm-community-moderation-admins">
            <ModerationList
              empty={
                adminManagement.loading
                  ? t('communityPage.admin.loadingAdmins')
                  : t('communityPage.admin.emptyAdmins')
              }
              items={adminManagement.moderators}
              renderItem={(moderator) => (
                <div key={moderator.id} className="tm-community-moderation-row">
                  <div className="tm-community-moderation-row-main">
                    <div className="tm-community-moderation-row-title">
                      {moderator.displayName}
                    </div>
                    <div className="tm-community-moderation-row-meta">
                      {getCommunityUserRoleLabel(moderator.role, t)} ·{' '}
                      {formatCommunityDate(moderator.createdAt, language)}
                    </div>
                  </div>
                  <div className="tm-community-moderation-row-actions">
                    {moderator.role === 'founder' ? (
                      <span className="tm-community-moderation-scan-meta">{t('communityPage.admin.founder')}</span>
                    ) : isFounder ? (
                      <button
                        type="button"
                        className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                        disabled={adminManagement.acting}
                        onClick={() =>
                          setPending({
                            kind: 'revoke-admin',
                            userId: moderator.id,
                            label: moderator.displayName,
                          })
                        }
                      >
                        {t('communityPage.admin.revokeAdmin')}
                      </button>
                    ) : (
                      <span className="tm-community-moderation-scan-meta">{t('communityPage.admin.admin')}</span>
                    )}
                  </div>
                </div>
              )}
            />

            {isFounder ? (
              <>
                <p className="tm-community-moderation-subtitle">{t('communityPage.admin.appointHint')}</p>
                <div className="tm-community-moderation-admin-search">
                  <input
                    type="search"
                    className="tm-community-moderation-admin-search-input"
                    placeholder={t('communityPage.admin.searchAdminPlaceholder')}
                    value={adminSearch}
                    onChange={(event) => {
                      const value = event.target.value
                      setAdminSearch(value)
                      void adminManagement.searchUsers(value)
                    }}
                  />
                  {adminManagement.searching ? (
                    <span className="tm-community-moderation-scan-meta">{t('communityPage.admin.searching')}</span>
                  ) : null}
                </div>

                <ModerationList
                  empty={
                    adminSearch.trim()
                      ? t('communityPage.admin.noMatchUsers')
                      : t('communityPage.admin.searchUsersEmpty')
                  }
                  items={adminSearch.trim() ? adminManagement.searchResults : []}
                  renderItem={(candidate) => (
                    <div key={candidate.id} className="tm-community-moderation-row">
                      <div className="tm-community-moderation-row-main">
                        <div className="tm-community-moderation-row-title">
                          {candidate.displayName}
                        </div>
                        <div className="tm-community-moderation-row-meta">
                          {getCommunityUserRoleLabel(candidate.role, t)} · {candidate.id.slice(0, 8)}…
                        </div>
                      </div>
                      <div className="tm-community-moderation-row-actions">
                        {candidate.role === 'admin' || candidate.role === 'founder' ? (
                          <span className="tm-community-moderation-scan-meta">{t('communityPage.admin.alreadyAdmin')}</span>
                        ) : (
                          <button
                            type="button"
                            className="tm-btn tm-btn--primary"
                            disabled={adminManagement.acting}
                            onClick={() =>
                              setPending({
                                kind: 'appoint-admin',
                                userId: candidate.id,
                                label: candidate.displayName,
                              })
                            }
                          >
                            {t('communityPage.admin.appointAdmin')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                />
              </>
            ) : null}
          </div>
        ) : null}

        {category === 'logs' ? (
          <ModerationList
            empty={t('communityPage.admin.emptyLogs')}
            items={moderation.logs}
            renderItem={(log) => (
              <div key={log.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">
                    {getModerationLogActionLabel(log.action, t)}
                  </div>
                  <div className="tm-community-moderation-row-meta">
                    {getModerationLogTargetTypeLabel(log.targetType, t)} · {log.targetId.slice(0, 8)}… ·{' '}
                    {formatCommunityDate(log.createdAt, language)}
                  </div>
                  {log.reason ? (
                    <p className="tm-community-moderation-row-desc">{log.reason}</p>
                  ) : null}
                </div>
              </div>
            )}
          />
        ) : null}
        </div>
      </div>

      {confirmDialog}
    </div>
  )
}

function ModerationList<T>({
  items,
  empty,
  renderItem,
}: {
  items: T[]
  empty: ReactNode
  renderItem: (item: T) => ReactNode
}) {
  if (items.length === 0) {
    return <div className="tm-user-center-empty">{empty}</div>
  }

  return <div className="tm-user-center-feed-list">{items.map(renderItem)}</div>
}

function buildConfirmDialog(
  pending: PendingAction,
  onCancel: () => void,
  onConfirm: () => void,
  t: ReturnType<typeof useI18n>['t'],
  reportActionLabels: ReturnType<typeof getModerationReportResolveActionLabels>,
) {
  switch (pending.kind) {
    case 'suspend-resource':
      return (
        <ConfirmDialog
          title={
            pending.reviewReject
              ? t('communityPage.admin.confirms.rejectReviewTitle')
              : t('communityPage.admin.confirms.delistResourceTitle')
          }
          message={
            pending.reviewReject
              ? t('communityPage.admin.confirms.rejectReviewResourceMessage', { title: pending.title })
              : t('communityPage.admin.confirms.delistResourceMessage', { title: pending.title })
          }
          confirmLabel={
            pending.reviewReject
              ? t('communityPage.admin.confirms.reject')
              : t('communityPage.admin.delist')
          }
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'ban-user':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.banUserTitle')}
          message={t('communityPage.admin.confirms.banUserMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.confirms.ban')}
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'ban-device':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.banDeviceTitle')}
          message={t('communityPage.admin.confirms.banDeviceMessage', {
            deviceName: pending.deviceName,
            userName: pending.userName,
          })}
          confirmLabel={t('communityPage.admin.confirms.ban')}
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'resolve-report':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.resolveReportTitle')}
          message={t('communityPage.admin.confirms.resolveReportMessage', {
            action: reportActionLabels[pending.action],
          })}
          confirmLabel={t('communityPage.admin.confirm')}
          danger={pending.action !== 'dismiss_report'}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'delete-message':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.deleteMessageTitle')}
          message={t('communityPage.admin.confirms.deleteMessageMessage', { preview: pending.preview })}
          confirmLabel={t('communityPage.admin.delete')}
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'cancel-task':
      return (
        <ConfirmDialog
          title={
            pending.reviewReject
              ? t('communityPage.admin.confirms.rejectReviewTitle')
              : t('communityPage.admin.confirms.cancelTaskTitle')
          }
          message={
            pending.reviewReject
              ? t('communityPage.admin.confirms.rejectReviewTaskMessage', { title: pending.title })
              : t('communityPage.admin.confirms.cancelTaskMessage', { title: pending.title })
          }
          confirmLabel={
            pending.reviewReject
              ? t('communityPage.admin.confirms.reject')
              : t('communityPage.admin.cancelTask')
          }
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'approve-resource':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.approveResourceTitle')}
          message={t('communityPage.admin.confirms.approveResourceMessage', { title: pending.title })}
          confirmLabel={t('communityPage.admin.confirms.approve')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'approve-task':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.approveTaskTitle')}
          message={t('communityPage.admin.confirms.approveTaskMessage', { title: pending.title })}
          confirmLabel={t('communityPage.admin.confirms.approve')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'appoint-admin':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.appointAdminTitle')}
          message={t('communityPage.admin.confirms.appointAdminMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.confirms.appoint')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'revoke-admin':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.revokeAdminTitle')}
          message={t('communityPage.admin.confirms.revokeAdminMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.confirms.revoke')}
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'unban-user':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.unbanUserTitle')}
          message={t('communityPage.admin.confirms.unbanUserMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.unban')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'unban-device':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.unbanDeviceTitle')}
          message={t('communityPage.admin.confirms.unbanDeviceMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.unban')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    default:
      return null
  }
}
