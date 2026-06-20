import { useCallback, useEffect, useMemo, useState } from 'react'

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
import {
  ADMIN_SUB_TAB_LABELS,
  MODERATION_CATEGORY_LABELS,
  ONLINE_SUB_TAB_LABELS,
  RESOURCE_SUB_TAB_LABELS,
  type AdminSubTab,
  type ModerationSubTab,
  type OnlineSubTab,
  type ResourceSubTab,
} from './community-moderation-utils'
import {
  isCommunityFounder,
  isCommunityModerator,
  USER_ROLE_LABELS,
} from './community-user-utils'
import { useCommunityModerationCategory } from './community-moderation-category-context'
import { useCommunityAdminManagement } from './useCommunityAdminManagement'
import { useCommunityModeration } from './useCommunityModeration'
import { useCommunityUser } from './useCommunityUser'

type PendingAction =
  | {
      kind: 'suspend-resource'
      resourceId: string
      title: string
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
    }
  | {
      kind: 'approve-resource'
      resourceId: string
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

function isResourceSubTab(subTab: ModerationSubTab): subTab is ResourceSubTab {
  return subTab in RESOURCE_SUB_TAB_LABELS
}

function isOnlineSubTab(subTab: ModerationSubTab): subTab is OnlineSubTab {
  return subTab in ONLINE_SUB_TAB_LABELS
}

function isAdminSubTab(subTab: ModerationSubTab): subTab is AdminSubTab {
  return subTab in ADMIN_SUB_TAB_LABELS
}

function filterResourcesByType(
  resources: CommunityModerationScanResource[],
  resourceType: CommunityResourceType,
) {
  return resources.filter((resource) => resource.resourceType === resourceType)
}

export function AdminModerationPanel() {
  const user = useCommunityUser()
  const isModerator = isCommunityModerator(user.profile?.role)
  const isFounder = isCommunityFounder(user.profile?.role)
  const moderation = useCommunityModeration({ autoScan: isModerator, enabled: isModerator })
  const adminManagement = useCommunityAdminManagement({
    canViewList: isModerator,
    canManage: isFounder,
  })
  const { category, subTab, setSubTab } = useCommunityModerationCategory()
  const [hubHealth, setHubHealth] = useState<CommunityHubHealthOutput | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [adminSearch, setAdminSearch] = useState('')
  const [deviceSearch, setDeviceSearch] = useState('')

  const loadHubHealth = useCallback(async () => {
    try {
      const health = await getCommunityHubHealth()
      setHubHealth(health)
    } catch {
      setHubHealth(null)
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
        device.deviceKind === 'mobile' ? '移动端' : '桌面端',
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
          { key: 'knowledge' as const, label: RESOURCE_SUB_TAB_LABELS.knowledge, count: scan?.onlineKnowledgeCount ?? 0 },
          { key: 'mcp' as const, label: RESOURCE_SUB_TAB_LABELS.mcp, count: scan?.onlineMcpCount ?? 0 },
          { key: 'skill' as const, label: RESOURCE_SUB_TAB_LABELS.skill, count: scan?.onlineSkillCount ?? 0 },
          { key: 'workflow' as const, label: RESOURCE_SUB_TAB_LABELS.workflow, count: scan?.onlineWorkflowCount ?? 0 },
          { key: 'tasks' as const, label: RESOURCE_SUB_TAB_LABELS.tasks, count: scan?.activeTaskCount ?? 0 },
        ]
      case 'review':
        return [{ key: 'pending' as const, label: '待审核', count: scan?.pendingReviewCount ?? 0 }]
      case 'online':
        return [
          { key: 'desktop' as const, label: ONLINE_SUB_TAB_LABELS.desktop, count: scan?.onlineDesktopDeviceCount ?? 0 },
          { key: 'mobile' as const, label: ONLINE_SUB_TAB_LABELS.mobile, count: scan?.onlineMobileDeviceCount ?? 0 },
        ]
      case 'admin':
        return [
          {
            key: 'registeredUsers' as const,
            label: ADMIN_SUB_TAB_LABELS.registeredUsers,
            count: hubHealth?.userCount ?? 0,
          },
          {
            key: 'admins' as const,
            label: ADMIN_SUB_TAB_LABELS.admins,
            count: adminManagement.moderators.length,
          },
          {
            key: 'blacklist' as const,
            label: ADMIN_SUB_TAB_LABELS.blacklist,
            count: blacklistCount,
          },
        ]
      case 'logs':
        return [{ key: 'logs' as const, label: '日志', count: moderation.logs.length }]
    }
  }, [
    adminManagement.moderators.length,
    blacklistCount,
    category,
    hubHealth?.userCount,
    moderation.logs.length,
    scan,
  ])

  const activeListCount = useMemo(() => {
    if (category === 'resources' && isResourceSubTab(subTab)) {
      if (subTab === 'tasks') return scan?.activeTasks.length ?? 0
      return filterResourcesByType(scan?.onlineResources ?? [], subTab).length
    }
    if (category === 'review' && subTab === 'pending') return scan?.pendingReview.length ?? 0
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
    if (!scan) return '尚未扫描'
    return formatCommunityDate(scan.scannedAt)
  }, [scan])

  const errorMessages = useMemo(() => {
    const messages = [moderation.error, moderation.scanError, adminManagement.error].filter(
      (message): message is string => Boolean(message),
    )
    return [...new Set(messages)]
  }, [adminManagement.error, moderation.error, moderation.scanError])

  if (!isModerator) {
    return (
      <div className="tm-community-market tm-community-user-center">
        <CommunityPanelHeader
          title="社区管理"
          subtitle="仅创始人或管理员可访问社区管理功能。"
        />
        <div className="tm-user-center-feed">
          <div className="tm-user-center-empty">需要管理权限</div>
        </div>
      </div>
    )
  }

  const handleConfirm = async () => {
    if (!pending) return

    try {
      switch (pending.kind) {
        case 'suspend-resource':
          await moderation.suspendResource(pending.resourceId, '管理员下架违规资源')
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
          await moderation.cancelTask(pending.taskId)
          break
        case 'approve-resource':
          await moderation.approveResource(pending.resourceId, '管理员审核通过')
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

  const confirmDialog = pending ? buildConfirmDialog(pending, () => setPending(null), handleConfirm) : null

  const profileRole = user.profile?.role

  return (
    <div className="tm-community-market tm-community-user-center">
      {errorMessages.map((message) => (
        <div key={message} className="tm-error-bar">
          {message}
        </div>
      ))}

      <div className="tm-user-center-overview">
        <CommunityPanelHeader
          title="社区管理"
          subtitle={isFounder ? '创始人控制台' : '管理员控制台'}
          titleExtra={
            profileRole ? (
              <span className="tm-user-center-role-badge">{USER_ROLE_LABELS[profileRole]}</span>
            ) : null
          }
          actions={
            <CommunityPanelRefreshButton
              title="立即扫描"
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
          aria-label={`${MODERATION_CATEGORY_LABELS[category]}数据分区`}
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
          <span>当前列表共 {activeListCount} 条记录</span>
          <span>
            最近扫描 {scannedAtLabel}
            {moderation.loading ? '（扫描中…）' : ''}
          </span>
        </div>

        <div className="tm-user-center-feed-body">
        {category === 'resources' && isResourceSubTab(subTab) && subTab !== 'tasks' ? (
          <ModerationList
            empty={`暂无在线${RESOURCE_SUB_TAB_LABELS[subTab]}`}
            items={filterResourcesByType(scan?.onlineResources ?? [], subTab)}
            renderItem={(resource) => (
              <div key={resource.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">{resource.title}</div>
                  <div className="tm-community-moderation-row-meta">
                    {resource.resourceType} · {resource.status} · {resource.authorName} ·{' '}
                    {formatCommunityDate(resource.createdAt)}
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
                    下架
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
                    封禁发布者
                  </button>
                </div>
              </div>
            )}
          />
        ) : null}

        {category === 'review' && subTab === 'pending' ? (
          <ModerationList
            empty="暂无待审核资源"
            items={scan?.pendingReview ?? []}
            renderItem={(resource) => (
              <div key={resource.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">{resource.title}</div>
                  <div className="tm-community-moderation-row-meta">
                    {resource.resourceType} · {resource.authorName}
                  </div>
                </div>
                <div className="tm-community-moderation-row-actions">
                  <button
                    type="button"
                    className="tm-btn tm-btn--primary"
                    disabled={moderation.acting}
                    onClick={() =>
                      setPending({
                        kind: 'approve-resource',
                        resourceId: resource.id,
                        title: resource.title,
                      })
                    }
                  >
                    通过
                  </button>
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
                    拒绝
                  </button>
                </div>
              </div>
            )}
          />
        ) : null}

        {category === 'resources' && subTab === 'tasks' ? (
          <ModerationList
            empty="暂无进行中任务"
            items={scan?.activeTasks ?? []}
            renderItem={(task) => (
              <div key={task.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">{task.title}</div>
                  <div className="tm-community-moderation-row-meta">
                    {task.status} · {task.publisherName} · {formatCommunityDate(task.createdAt)}
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
                    取消任务
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
                    封禁发布者
                  </button>
                </div>
              </div>
            )}
          />
        ) : null}

        {category === 'admin' && subTab === 'blacklist' ? (
          blacklistEntries.length === 0 ? (
            <div className="tm-user-center-empty">暂无黑名单记录</div>
          ) : (
            <div className="tm-community-moderation-table-wrap">
              <div className="tm-community-moderation-table-head">
                <span>序号</span>
                <span>用户名</span>
                <span>设备 ID</span>
                <span>操作</span>
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
                        解禁
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
                placeholder="搜索设备名称、设备 ID 或用户名"
                value={deviceSearch}
                onChange={(event) => setDeviceSearch(event.target.value)}
              />
            </div>
            <ModerationList
              empty={
                deviceSearch.trim()
                  ? '未找到匹配设备或用户'
                  : subTab === 'mobile'
                    ? '暂无在线移动端设备'
                    : '暂无在线桌面端设备'
              }
              items={filteredDevicesByKind}
              renderItem={(device) => (
                <div key={device.deviceId} className="tm-community-moderation-row">
                  <div className="tm-community-moderation-row-main">
                    <div className="tm-community-moderation-row-title">{device.deviceName}</div>
                    <div className="tm-community-moderation-row-meta">
                      {device.deviceKind === 'mobile' ? '移动端' : '桌面端'} · {device.userName} ·{' '}
                      最近活跃 {formatCommunityDate(device.lastSeenAt)}
                    </div>
                    <div className="tm-community-moderation-row-desc">设备 ID：{device.deviceId}</div>
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
                      封禁设备
                    </button>
                  </div>
                </div>
              )}
            />
          </div>
        ) : null}

        {category === 'admin' && subTab === 'registeredUsers' ? (
          <div className="tm-user-center-empty">
            社区共有 {hubHealth?.userCount ?? '—'} 位注册用户
          </div>
        ) : null}

        {category === 'admin' && subTab === 'admins' && isModerator ? (
          <div className="tm-community-moderation-admins">
            <ModerationList
              empty={adminManagement.loading ? '加载中…' : '暂无管理员'}
              items={adminManagement.moderators}
              renderItem={(moderator) => (
                <div key={moderator.id} className="tm-community-moderation-row">
                  <div className="tm-community-moderation-row-main">
                    <div className="tm-community-moderation-row-title">
                      {moderator.displayName}
                    </div>
                    <div className="tm-community-moderation-row-meta">
                      {USER_ROLE_LABELS[moderator.role]} · {formatCommunityDate(moderator.createdAt)}
                    </div>
                  </div>
                  <div className="tm-community-moderation-row-actions">
                    {moderator.role === 'founder' ? (
                      <span className="tm-community-moderation-scan-meta">创始人</span>
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
                        撤销管理员
                      </button>
                    ) : (
                      <span className="tm-community-moderation-scan-meta">管理员</span>
                    )}
                  </div>
                </div>
              )}
            />

            {isFounder ? (
              <>
                <p className="tm-community-moderation-subtitle">
                  搜索社区用户并任命为管理员。管理员可协助处置违规内容，但无法任命其他管理员。
                </p>
                <div className="tm-community-moderation-admin-search">
                  <input
                    type="search"
                    className="tm-community-moderation-admin-search-input"
                    placeholder="搜索用户名称或 ID 以任命管理员"
                    value={adminSearch}
                    onChange={(event) => {
                      const value = event.target.value
                      setAdminSearch(value)
                      void adminManagement.searchUsers(value)
                    }}
                  />
                  {adminManagement.searching ? (
                    <span className="tm-community-moderation-scan-meta">搜索中…</span>
                  ) : null}
                </div>

                <ModerationList
                  empty={adminSearch.trim() ? '未找到匹配用户' : '输入关键词搜索用户'}
                  items={adminSearch.trim() ? adminManagement.searchResults : []}
                  renderItem={(candidate) => (
                    <div key={candidate.id} className="tm-community-moderation-row">
                      <div className="tm-community-moderation-row-main">
                        <div className="tm-community-moderation-row-title">
                          {candidate.displayName}
                        </div>
                        <div className="tm-community-moderation-row-meta">
                          {USER_ROLE_LABELS[candidate.role]} · {candidate.id.slice(0, 8)}…
                        </div>
                      </div>
                      <div className="tm-community-moderation-row-actions">
                        {candidate.role === 'admin' || candidate.role === 'founder' ? (
                          <span className="tm-community-moderation-scan-meta">已是管理角色</span>
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
                            任命为管理员
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
            empty="暂无处置日志"
            items={moderation.logs}
            renderItem={(log) => (
              <div key={log.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">{log.action}</div>
                  <div className="tm-community-moderation-row-meta">
                    {log.targetType} · {log.targetId.slice(0, 8)}… ·{' '}
                    {formatCommunityDate(log.createdAt)}
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
  empty: string
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
) {
  switch (pending.kind) {
    case 'suspend-resource':
      return (
        <ConfirmDialog
          title="下架资源"
          message={`确定下架「${pending.title}」吗？资源将从市场移除。`}
          confirmLabel="下架"
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'ban-user':
      return (
        <ConfirmDialog
          title="封禁用户"
          message={`确定封禁用户「${pending.label}」7 天吗？封禁期间无法发布资源、留言或任务。`}
          confirmLabel="封禁"
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'ban-device':
      return (
        <ConfirmDialog
          title="封禁设备"
          message={`确定封禁设备「${pending.deviceName}」（${pending.userName}）7 天吗？该设备将无法继续上报在线状态。`}
          confirmLabel="封禁"
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'resolve-report':
      return (
        <ConfirmDialog
          title="处理举报"
          message={`确定按「${pending.action}」处理该举报吗？`}
          confirmLabel="确认"
          danger={pending.action !== 'dismiss_report'}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'delete-message':
      return (
        <ConfirmDialog
          title="删除留言"
          message={`确定删除留言「${pending.preview}」吗？`}
          confirmLabel="删除"
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'cancel-task':
      return (
        <ConfirmDialog
          title="取消任务"
          message={`确定取消任务「${pending.title}」吗？`}
          confirmLabel="取消任务"
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'approve-resource':
      return (
        <ConfirmDialog
          title="通过审核"
          message={`确定通过资源「${pending.title}」并公开发布吗？`}
          confirmLabel="通过"
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'appoint-admin':
      return (
        <ConfirmDialog
          title="任命管理员"
          message={`确定任命「${pending.label}」为社区管理员吗？管理员可扫描内容并处置违规资源。`}
          confirmLabel="任命"
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'revoke-admin':
      return (
        <ConfirmDialog
          title="撤销管理员"
          message={`确定撤销「${pending.label}」的管理员权限吗？`}
          confirmLabel="撤销"
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'unban-user':
      return (
        <ConfirmDialog
          title="解禁用户"
          message={`确定解除用户「${pending.label}」的封禁吗？`}
          confirmLabel="解禁"
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'unban-device':
      return (
        <ConfirmDialog
          title="解禁设备"
          message={`确定解除设备「${pending.label}」的封禁吗？`}
          confirmLabel="解禁"
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    default:
      return null
  }
}
