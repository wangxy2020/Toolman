import { useMemo, useState, type ReactNode } from 'react'

import {
  type CommunityModerationReport,
  type CommunityModerationReportResolveInput,
} from '@toolman/shared'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconFlag, IconRefresh } from '../../components/icons'
import { formatCommunityDate, formatCommunityCount } from './community-market-utils'
import {
  getDefaultReportResolveAction,
  MODERATION_REPORT_REASON_LABELS,
  MODERATION_TAB_LABELS,
  MODERATION_TARGET_TYPE_LABELS,
  type ModerationTab,
} from './community-moderation-utils'
import { formatNewsPreview } from './community-news-utils'
import {
  isCommunityFounder,
  isCommunityModerator,
  USER_ROLE_LABELS,
} from './community-user-utils'
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

export function AdminModerationPanel() {
  const user = useCommunityUser()
  const isModerator = isCommunityModerator(user.profile?.role)
  const isFounder = isCommunityFounder(user.profile?.role)
  const moderation = useCommunityModeration({ autoScan: isModerator, enabled: isModerator })
  const adminManagement = useCommunityAdminManagement({
    canViewList: isModerator,
    canManage: isFounder,
  })
  const tabs = useMemo<ModerationTab[]>(() => {
    const base: ModerationTab[] = ['reports', 'resources', 'pending', 'messages', 'tasks']
    if (isModerator) base.push('adminList')
    if (isFounder) base.push('adminAppoint')
    base.push('logs')
    return base
  }, [isFounder, isModerator])
  const [tab, setTab] = useState<ModerationTab>('reports')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [adminSearch, setAdminSearch] = useState('')

  const scan = moderation.scan

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
      <div className="tm-community-moderation">
        <div className="tm-module-empty">
          <h2 className="tm-module-empty-title">需要管理权限</h2>
          <p className="tm-module-empty-hint">仅创始人或管理员可访问社区管理功能。</p>
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
      }
      setPending(null)
    } catch {
      // error surfaced via moderation.error
    }
  }

  const confirmDialog = pending ? buildConfirmDialog(pending, () => setPending(null), handleConfirm) : null

  return (
    <div className="tm-community-moderation">
      <div className="tm-community-moderation-header">
        <div>
          <h2 className="tm-community-moderation-title">社区管理</h2>
          <p className="tm-community-moderation-subtitle">
            {isFounder
              ? '作为创始人，你可扫描本节点在线内容、处置违规信息，并任命或撤销管理员。'
              : '作为管理员，你可扫描本节点在线内容并处置违规信息与资源。'}
          </p>
        </div>
        <div className="tm-community-moderation-header-actions">
          <span className="tm-community-moderation-scan-meta">
            <IconFlag size={14} />
            最近扫描：{scannedAtLabel}
            {moderation.loading ? '（扫描中…）' : ''}
          </span>
          <button
            type="button"
            className="tm-btn tm-btn--ghost"
            disabled={moderation.loading || moderation.acting}
            onClick={() => void moderation.refresh()}
          >
            <IconRefresh size={14} className={moderation.loading ? 'tm-icon-spin' : undefined} />
            立即扫描
          </button>
        </div>
      </div>

      {errorMessages.map((message) => (
        <div key={message} className="tm-error-bar">
          {message}
        </div>
      ))}

      {scan ? (
        <div className="tm-community-moderation-stats">
          <ModerationStat value={scan.pendingReviewCount} label="待审核" />
          <ModerationStat value={scan.openReportCount} label="待处理举报" />
          <ModerationStat value={scan.boardMessageCount} label="留言" />
          <ModerationStat value={scan.onlineKnowledgeCount} label="知识库资源" />
          <ModerationStat value={scan.onlineMcpCount} label="MCP资源" />
          <ModerationStat value={scan.onlineSkillCount} label="Skills资源" />
          <ModerationStat value={scan.onlineWorkflowCount} label="工作流资源" />
          <ModerationStat value={scan.onlineDesktopDeviceCount} label="在线桌面端设备" />
          <ModerationStat value={scan.onlineMobileDeviceCount} label="在线移动端设备" />
          <ModerationStat value={scan.activeTaskCount} label="进行中任务" />
        </div>
      ) : null}

      <div className="tm-community-moderation-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={[
              'tm-community-moderation-tab',
              tab === item ? 'tm-community-moderation-tab--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab(item)}
          >
            {MODERATION_TAB_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="tm-community-moderation-body">
        {tab === 'reports' ? (
          <ModerationList
            empty="暂无待处理举报"
            items={scan?.openReports ?? []}
            renderItem={(report) => (
              <div key={report.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">
                    {MODERATION_TARGET_TYPE_LABELS[report.targetType]} ·{' '}
                    {MODERATION_REPORT_REASON_LABELS[report.reason]}
                  </div>
                  <div className="tm-community-moderation-row-meta">
                    目标 {report.targetId.slice(0, 8)}… ·{' '}
                    {formatCommunityDate(report.createdAt)}
                  </div>
                  {report.description ? (
                    <p className="tm-community-moderation-row-desc">{report.description}</p>
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
                        action: getDefaultReportResolveAction(report.targetType),
                      })
                    }
                  >
                    处置
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
                    驳回
                  </button>
                </div>
              </div>
            )}
          />
        ) : null}

        {tab === 'resources' ? (
          <ModerationList
            empty="暂无在线资源"
            items={scan?.onlineResources ?? []}
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

        {tab === 'pending' ? (
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

        {tab === 'messages' ? (
          <ModerationList
            empty="暂无留言"
            items={scan?.recentMessages ?? []}
            renderItem={(message) => (
              <div key={message.id} className="tm-community-moderation-row">
                <div className="tm-community-moderation-row-main">
                  <div className="tm-community-moderation-row-title">{message.authorName}</div>
                  <div className="tm-community-moderation-row-meta">
                    {formatCommunityDate(message.createdAt)}
                  </div>
                  <p className="tm-community-moderation-row-desc">
                    {formatNewsPreview(message.body)}
                  </p>
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
                        preview: formatNewsPreview(message.body),
                      })
                    }
                  >
                    删除
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
                    封禁用户
                  </button>
                </div>
              </div>
            )}
          />
        ) : null}

        {tab === 'tasks' ? (
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

        {tab === 'adminList' && isModerator ? (
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
          </div>
        ) : null}

        {tab === 'adminAppoint' && isFounder ? (
          <div className="tm-community-moderation-admins">
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
          </div>
        ) : null}

        {tab === 'logs' ? (
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
    return <div className="tm-community-moderation-empty">{empty}</div>
  }

  return <div className="tm-community-moderation-list">{items.map(renderItem)}</div>
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
    default:
      return null
  }
}

function ModerationStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="tm-community-moderation-stat">
      <span className="tm-community-moderation-stat-value" title={String(value)}>
        {formatCommunityCount(value)}
      </span>
      <span className="tm-community-moderation-stat-label">{label}</span>
    </div>
  )
}
