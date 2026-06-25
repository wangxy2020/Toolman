import { useMemo, useRef, useState, type ReactNode } from 'react'

import { type CommunityResourceItem, type CommunityResourceType, type CommunityTaskItem, type CommunityBoardMessage } from '@toolman/shared'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CommunityPanelHeader, CommunityPanelRefreshButton } from './CommunityPanelHeader'
import { CommunityCommentDropdown } from './CommunityCommentDropdown'
import { CommunityMessagePublishModal } from './CommunityMessagePublishModal'
import { CommunityResourcePublishModal } from './CommunityResourcePublishModal'
import { TaskCreateModal } from './TaskCreateModal'
import { cancelCommunityTask, deleteCommunityBoardMessage, deleteCommunityResource, deleteCommunityTask } from './community-api.client'
import { notifyCommunityBoardChanged, notifyCommunityUserDataChanged } from './community-events'
import { buildResourceCommentTarget, buildTaskCommentTarget, type CommunityCommentTarget } from './community-comment-utils'
import {
  canDeleteCommunityResourceFromUserCenter,
  canDeleteCommunityTaskFromUserCenter,
  canModerationResubmitResource,
  canModerationResubmitTask,
  canWithdrawCommunityTask,
  getResourceUserCenterDisplayStatusLabel,
  getTaskUserCenterStatusLabel,
} from './community-user-center-status'
import {
  groupUserCenterResources,
  useCommunityUserCenter,
  type UserCenterSection,
} from './useCommunityUserCenter'
import { isUiMockCommunityId } from './community-ui-mock'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from '../../components/module-page-status'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useI18n } from '../../i18n/useI18n'
import {
  getCommunityInstallStatusLabel,
  getCommunityTaskStatusLabel,
  getCommunityTaskTypeLabel,
} from '../../i18n/community-status-labels'
import {
  getCommunityUserRoleLabel,
  translateCommunityDisplayName,
} from '../../i18n/community-user-labels'

const SECTIONS: Array<{ key: UserCenterSection; labelKey: `communityPage.mine.sections.${UserCenterSection}` }> = [
  { key: 'publishes', labelKey: 'communityPage.mine.sections.publishes' },
  { key: 'messages', labelKey: 'communityPage.mine.sections.messages' },
  { key: 'installs', labelKey: 'communityPage.mine.sections.installs' },
  { key: 'likes', labelKey: 'communityPage.mine.sections.likes' },
  { key: 'favorites', labelKey: 'communityPage.mine.sections.favorites' },
  { key: 'tasks', labelKey: 'communityPage.mine.sections.tasks' },
]

function getUserCenterResourceLabel(
  type: CommunityResourceType,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const key = `communityPage.mine.resourceTypes.${type}` as const
  return t(key)
}

type FeedStat = {
  kind: 'like' | 'favorite' | 'reply'
  label: string
  accent?: boolean
}

function formatUserCenterDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getSectionCount(
  section: UserCenterSection,
  center: ReturnType<typeof useCommunityUserCenter>,
): number {
  switch (section) {
    case 'publishes':
      return center.publishes.length
    case 'messages':
      return center.messages.length
    case 'installs':
      return center.installs.length
    case 'likes':
      return center.likeCount
    case 'favorites':
      return center.favoriteCount
    case 'tasks':
      return center.tasks.published.length + center.tasks.assigned.length
  }
}

function FeedStatIcon({ kind }: { kind: FeedStat['kind'] }) {
  if (kind === 'like') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M14 10h4.757a2 2 0 011.708 2.89l-3.514 6A2 2 0 0115.243 20H7a2 2 0 01-2-2v-8a2 2 0 01.586-1.414l6.586-6.586a2 2 0 012.828 0L15 4.5V10z"
        />
      </svg>
    )
  }
  if (kind === 'favorite') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  )
}

function UserCenterActionLink({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'primary' | 'danger'
}) {
  return (
    <button
      type="button"
      className={[
        'tm-user-center-text-btn',
        tone === 'primary' ? 'tm-user-center-text-btn--primary' : '',
        tone === 'danger' ? 'tm-user-center-text-btn--danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function UserCenterFeedCard({
  tag,
  date,
  title,
  description,
  stats,
  footerStats,
  actions,
}: {
  tag: string
  date: string
  title: string
  description?: string | null
  stats?: FeedStat[]
  footerStats?: ReactNode
  actions?: ReactNode
}) {
  return (
    <article className="tm-user-center-feed-card">
      <div className="tm-user-center-feed-card-top">
        <span className="tm-user-center-feed-tag">
          <span className="tm-user-center-feed-tag-dot" aria-hidden="true" />
          {tag}
        </span>
        <span className="tm-user-center-feed-date">{date}</span>
      </div>
      <h4 className="tm-user-center-feed-title">{title}</h4>
      {description ? <p className="tm-user-center-feed-desc">{description}</p> : null}
      {footerStats || stats?.length || actions ? (
        <div className="tm-user-center-feed-footer">
          {footerStats ? (
            <div className="tm-user-center-feed-stats">{footerStats}</div>
          ) : stats && stats.length > 0 ? (
            <div className="tm-user-center-feed-stats">
              {stats.map((stat) => (
                <span
                  key={`${stat.kind}-${stat.label}`}
                  className={[
                    'tm-user-center-feed-stat',
                    stat.accent ? 'tm-user-center-feed-stat--accent' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <FeedStatIcon kind={stat.kind} />
                  {stat.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="tm-user-center-feed-stats" aria-hidden="true" />
          )}
          {actions ? <div className="tm-user-center-feed-actions">{actions}</div> : null}
        </div>
      ) : null}
    </article>
  )
}

function UserCenterRejectedFeedbackStat({
  target,
  comments,
  t,
}: {
  target: CommunityCommentTarget
  comments: ReturnType<typeof useCommunityCommentExpansion>
  t: ReturnType<typeof useI18n>['t']
}) {
  const statRef = useRef<HTMLButtonElement>(null)
  const open = comments.isExpanded(target)
  const commentCount = comments.getCount(target)

  return (
    <>
      <button
        ref={statRef}
        type="button"
        className={[
          'tm-user-center-feed-stat',
          'tm-user-center-feed-stat--clickable',
          commentCount > 0 ? 'tm-user-center-feed-stat--accent' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={t('communityPage.mine.viewReviewNotes')}
        aria-expanded={open}
        onClick={() => comments.toggleExpanded(target)}
      >
        <FeedStatIcon kind="reply" />
        {t('communityPage.mine.rejected')}
      </button>
      <CommunityCommentDropdown
        anchorRef={statRef}
        target={target}
        open={open}
        onClose={() => comments.toggleExpanded(target)}
        onCountChange={(count) => comments.setCount(target, count)}
        emptyHint={t('communityPage.mine.noReviewNotes')}
      />
    </>
  )
}

function UserCenterFeedGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="tm-user-center-feed-group">
      <h3 className="tm-user-center-feed-group-label">{label}</h3>
      <div className="tm-user-center-feed-list">{children}</div>
    </section>
  )
}

export function UserCenterPanel() {
  const { t } = useI18n()
  const [section, setSection] = useState<UserCenterSection>('publishes')
  const [resourceToWithdraw, setResourceToWithdraw] = useState<CommunityResourceItem | null>(null)
  const [resumePublish, setResumePublish] = useState<CommunityResourceItem | null>(null)
  const [editPublish, setEditPublish] = useState<CommunityResourceItem | null>(null)
  const [resumeTask, setResumeTask] = useState<CommunityTaskItem | null>(null)
  const [editTask, setEditTask] = useState<CommunityTaskItem | null>(null)
  const [taskToDelete, setTaskToDelete] = useState<CommunityTaskItem | null>(null)
  const [taskToWithdraw, setTaskToWithdraw] = useState<CommunityTaskItem | null>(null)
  const [resumeMessage, setResumeMessage] = useState<CommunityBoardMessage | null>(null)
  const [editMessage, setEditMessage] = useState<CommunityBoardMessage | null>(null)
  const [messageToDelete, setMessageToDelete] = useState<CommunityBoardMessage | null>(null)
  const [publishNotice, setPublishNotice] = useState<string | null>(null)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const center = useCommunityUserCenter()
  const comments = useCommunityCommentExpansion()
  const profile = center.profile
  const activeCount = useMemo(() => getSectionCount(section, center), [section, center])

  const handleConfirmWithdraw = async () => {
    if (!resourceToWithdraw) return
    setWithdrawingId(resourceToWithdraw.id)
    try {
      await deleteCommunityResource(resourceToWithdraw.id)
      notifyCommunityUserDataChanged()
      setResourceToWithdraw(null)
      await center.load()
    } catch (withdrawError) {
      const message = withdrawError instanceof Error ? withdrawError.message : t('communityPage.mine.errors.deleteFailed')
      setWithdrawError(message)
    } finally {
      setWithdrawingId(null)
    }
  }

  const handleConfirmWithdrawTask = async () => {
    if (!taskToWithdraw) return
    setWithdrawingId(taskToWithdraw.id)
    try {
      await cancelCommunityTask(taskToWithdraw.id)
      notifyCommunityUserDataChanged()
      setTaskToWithdraw(null)
      await center.load()
    } catch (withdrawError) {
      const message = withdrawError instanceof Error ? withdrawError.message : t('communityPage.mine.errors.withdrawFailed')
      setWithdrawError(message)
    } finally {
      setWithdrawingId(null)
    }
  }

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) return
    setWithdrawingId(taskToDelete.id)
    try {
      await deleteCommunityTask(taskToDelete.id)
      notifyCommunityUserDataChanged()
      setTaskToDelete(null)
      await center.load()
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : t('communityPage.mine.errors.deleteTaskFailed')
      setWithdrawError(message)
    } finally {
      setWithdrawingId(null)
    }
  }

  const closePublishModal = () => {
    setResumePublish(null)
    setEditPublish(null)
  }

  const closeTaskModal = () => {
    setResumeTask(null)
    setEditTask(null)
  }

  const closeMessageModal = () => {
    setResumeMessage(null)
    setEditMessage(null)
  }

  const handleConfirmDeleteMessage = async () => {
    if (!messageToDelete) return
    setWithdrawingId(messageToDelete.id)
    try {
      if (!isUiMockCommunityId(messageToDelete.id)) {
        await deleteCommunityBoardMessage(messageToDelete.id)
      }
      notifyCommunityBoardChanged()
      notifyCommunityUserDataChanged()
      setMessageToDelete(null)
      await center.load()
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : t('communityPage.mine.errors.deleteMessageFailed')
      setWithdrawError(message)
    } finally {
      setWithdrawingId(null)
    }
  }

  const canWithdrawResource = (item: CommunityResourceItem) =>
    item.status === 'draft' || item.status === 'pending_review'

  useRegisterModulePanelError('community-user-center-profile', center.profileError)
  useRegisterModulePanelError('community-user-center', center.error)
  useRegisterModulePanelError('community-user-center-withdraw', withdrawError, () =>
    setWithdrawError(null),
  )
  useRegisterModulePanelStatus(
    'community-user-center-loading',
    center.loading || center.profileLoading
      ? { tone: 'info', message: t('communityPage.mine.loading') }
      : publishNotice
        ? { tone: 'info', message: publishNotice }
        : null,
  )

  const renderSectionContent = () => {
    if (center.profileLoading || center.loading) {
      return <div className="tm-user-center-empty">{t('communityPage.mine.loading')}</div>
    }
    if (!profile) {
      return <div className="tm-user-center-empty">{t('communityPage.mine.loginRequired')}</div>
    }

    if (section === 'publishes') {
      if (center.publishes.length === 0) {
        return <div className="tm-user-center-empty">{t('communityPage.mine.emptyPublishes')}</div>
      }
      return (
        <div className="tm-user-center-feed-list">
          {center.publishes.map((item) => (
            <UserCenterFeedCard
              key={item.id}
              tag={getUserCenterResourceLabel(item.resourceType, t)}
              date={formatUserCenterDateTime(item.updatedAt)}
              title={item.title}
              description={item.description}
              stats={
                canModerationResubmitResource(item)
                  ? undefined
                  : [
                      { kind: 'like', label: t('communityPage.mine.likesCount', { count: item.likeCount }) },
                      {
                        kind: 'favorite',
                        label: `${getResourceUserCenterDisplayStatusLabel(item, t)} · v${item.version}`,
                      },
                    ]
              }
              footerStats={
                canModerationResubmitResource(item) ? (
                  <UserCenterRejectedFeedbackStat
                    target={buildResourceCommentTarget(item.id)}
                    comments={comments}
                    t={t}
                  />
                ) : undefined
              }
              actions={
                <>
                  {item.status === 'draft' ? (
                    <UserCenterActionLink
                      tone="primary"
                      onClick={() => {
                        setPublishNotice(null)
                        setEditPublish(null)
                        setResumePublish(item)
                      }}
                    >
                      {t('communityPage.mine.submitReview')}
                    </UserCenterActionLink>
                  ) : null}
                  {canModerationResubmitResource(item) ? (
                    <>
                      <UserCenterActionLink
                        onClick={() => {
                          setPublishNotice(null)
                          setResumePublish(null)
                          setEditPublish(item)
                        }}
                      >
                        {t('communityPage.mine.edit')}
                      </UserCenterActionLink>
                      <UserCenterActionLink
                        tone="primary"
                        onClick={() => {
                          setPublishNotice(null)
                          setEditPublish(null)
                          setResumePublish(item)
                        }}
                      >
                        {t('communityPage.mine.resubmit')}
                      </UserCenterActionLink>
                      <UserCenterActionLink
                        tone="danger"
                        disabled={withdrawingId === item.id}
                        onClick={() => setResourceToWithdraw(item)}
                      >
                        {withdrawingId === item.id
                          ? t('communityPage.mine.deleting')
                          : t('communityPage.mine.delete')}
                      </UserCenterActionLink>
                    </>
                  ) : null}
                  {canWithdrawResource(item) && item.status === 'pending_review' ? (
                    <UserCenterActionLink
                      tone="danger"
                      disabled={withdrawingId === item.id}
                      onClick={() => setResourceToWithdraw(item)}
                    >
                      {withdrawingId === item.id
                        ? t('communityPage.mine.withdrawing')
                        : t('communityPage.mine.withdraw')}
                    </UserCenterActionLink>
                  ) : canDeleteCommunityResourceFromUserCenter(item) &&
                    !canModerationResubmitResource(item) &&
                    item.status !== 'pending_review' ? (
                    <UserCenterActionLink
                      tone="danger"
                      disabled={withdrawingId === item.id}
                      onClick={() => setResourceToWithdraw(item)}
                    >
                      {withdrawingId === item.id
                        ? t('communityPage.mine.deleting')
                        : t('communityPage.mine.delete')}
                    </UserCenterActionLink>
                  ) : null}
                </>
              }
            />
          ))}
        </div>
      )
    }

    if (section === 'messages') {
      if (center.messages.length === 0) {
        return <div className="tm-user-center-empty">{t('communityPage.mine.emptyMessages')}</div>
      }
      return (
        <div className="tm-user-center-feed-list">
          {center.messages.map((item) => (
            <UserCenterFeedCard
              key={item.id}
              tag={t('communityPage.mine.tags.message')}
              date={formatUserCenterDateTime(item.createdAt)}
              title={item.body}
              stats={[
                { kind: 'like', label: t('communityPage.mine.likesCount', { count: item.likeCount }) },
                {
                  kind: 'favorite',
                  label: t('communityPage.mine.favoritesCount', { count: item.favoriteCount }),
                },
                {
                  kind: 'reply',
                  label: t('communityPage.mine.replyCount', { count: item.replyCount }),
                  accent: item.replyCount > 0,
                },
              ]}
              actions={
                <>
                  <UserCenterActionLink
                    onClick={() => {
                      setPublishNotice(null)
                      setResumeMessage(null)
                      setEditMessage(item)
                    }}
                  >
                    {t('communityPage.mine.edit')}
                  </UserCenterActionLink>
                  <UserCenterActionLink
                    tone="primary"
                    onClick={() => {
                      setPublishNotice(null)
                      setEditMessage(null)
                      setResumeMessage(item)
                    }}
                  >
                    {t('communityPage.mine.resubmit')}
                  </UserCenterActionLink>
                  <UserCenterActionLink
                    tone="danger"
                    disabled={withdrawingId === item.id}
                    onClick={() => setMessageToDelete(item)}
                  >
                    {withdrawingId === item.id
                      ? t('communityPage.mine.deleting')
                      : t('communityPage.mine.delete')}
                  </UserCenterActionLink>
                </>
              }
            />
          ))}
        </div>
      )
    }

    if (section === 'installs') {
      if (center.installs.length === 0) {
        return <div className="tm-user-center-empty">{t('communityPage.mine.emptyInstalls')}</div>
      }
      return (
        <div className="tm-user-center-feed-list">
          {center.installs.map((item) => (
            <UserCenterFeedCard
              key={item.id}
              tag={getCommunityInstallStatusLabel(item.installStatus, t)}
              date={formatUserCenterDateTime(item.installedAt)}
              title={t('communityPage.mine.resourceTitle', { id: item.resourceId })}
              description={item.errorMessage ?? item.localRef}
            />
          ))}
        </div>
      )
    }

    if (section === 'likes') {
      if (center.likeCount === 0) {
        return <div className="tm-user-center-empty">{t('communityPage.mine.emptyLikes')}</div>
      }
      const likedResourceGroups = groupUserCenterResources(center.likes.resources)
      return (
        <div className="tm-user-center-feed-groups">
          {center.likes.news.length > 0 ? (
            <UserCenterFeedGroup label={t('communityPage.mine.tags.news')}>
              {center.likes.news.map((item) => (
                <UserCenterFeedCard
                  key={`news-${item.id}`}
                  tag={t('communityPage.mine.tags.news')}
                  date={formatUserCenterDateTime(item.publishedAt)}
                  title={item.title}
                  description={item.summary}
                  stats={[
                    { kind: 'like', label: t('communityPage.mine.likesCount', { count: item.likeCount }) },
                  ]}
                />
              ))}
            </UserCenterFeedGroup>
          ) : null}
          {center.likes.messages.length > 0 ? (
            <UserCenterFeedGroup label={t('communityPage.mine.tags.message')}>
              {center.likes.messages.map((item) => (
                <UserCenterFeedCard
                  key={`message-${item.id}`}
                  tag={t('communityPage.mine.tags.message')}
                  date={formatUserCenterDateTime(item.createdAt)}
                  title={item.body}
                  stats={[
                    { kind: 'like', label: t('communityPage.mine.likesCount', { count: item.likeCount }) },
                    { kind: 'reply', label: item.author.displayName },
                  ]}
                />
              ))}
            </UserCenterFeedGroup>
          ) : null}
          {Object.entries(likedResourceGroups).map(([resourceType, items]) => (
            <UserCenterFeedGroup
              key={`likes-${resourceType}`}
              label={getUserCenterResourceLabel(resourceType as CommunityResourceType, t)}
            >
              {items.map((item) => (
                <UserCenterFeedCard
                  key={`resource-${item.id}`}
                  tag={getUserCenterResourceLabel(item.resourceType, t)}
                  date={formatUserCenterDateTime(item.updatedAt)}
                  title={item.title}
                  description={item.description}
                  stats={[
                    { kind: 'like', label: t('communityPage.mine.likesCount', { count: item.likeCount }) },
                  ]}
                />
              ))}
            </UserCenterFeedGroup>
          ))}
        </div>
      )
    }

    if (section === 'favorites') {
      if (center.favoriteCount === 0) {
        return <div className="tm-user-center-empty">{t('communityPage.mine.emptyFavorites')}</div>
      }
      const favoriteResourceGroups = groupUserCenterResources(center.favorites.resources)
      return (
        <div className="tm-user-center-feed-groups">
          {center.favorites.news.length > 0 ? (
            <UserCenterFeedGroup label={t('communityPage.mine.tags.news')}>
              {center.favorites.news.map((item) => (
                <UserCenterFeedCard
                  key={`news-${item.id}`}
                  tag={t('communityPage.mine.tags.news')}
                  date={formatUserCenterDateTime(item.publishedAt)}
                  title={item.title}
                  description={item.summary}
                  stats={[
                    {
                      kind: 'favorite',
                      label: t('communityPage.mine.favoritesCount', { count: item.favoriteCount }),
                    },
                  ]}
                />
              ))}
            </UserCenterFeedGroup>
          ) : null}
          {center.favorites.messages.length > 0 ? (
            <UserCenterFeedGroup label={t('communityPage.mine.tags.message')}>
              {center.favorites.messages.map((item) => (
                <UserCenterFeedCard
                  key={`message-${item.id}`}
                  tag={t('communityPage.mine.tags.message')}
                  date={formatUserCenterDateTime(item.createdAt)}
                  title={item.body}
                  stats={[
                    {
                      kind: 'favorite',
                      label: t('communityPage.mine.favoritesCount', { count: item.favoriteCount }),
                    },
                  ]}
                />
              ))}
            </UserCenterFeedGroup>
          ) : null}
          {Object.entries(favoriteResourceGroups).map(([resourceType, items]) => (
            <UserCenterFeedGroup
              key={`favorites-${resourceType}`}
              label={getUserCenterResourceLabel(resourceType as CommunityResourceType, t)}
            >
              {items.map((item) => (
                <UserCenterFeedCard
                  key={`resource-${item.id}`}
                  tag={getUserCenterResourceLabel(item.resourceType, t)}
                  date={formatUserCenterDateTime(item.updatedAt)}
                  title={item.title}
                  description={item.description}
                  stats={[
                    {
                      kind: 'favorite',
                      label: t('communityPage.mine.favoritesCount', { count: item.favoriteCount }),
                    },
                  ]}
                />
              ))}
            </UserCenterFeedGroup>
          ))}
        </div>
      )
    }

    if (center.tasks.published.length === 0 && center.tasks.assigned.length === 0) {
      return <div className="tm-user-center-empty">{t('communityPage.mine.emptyTasks')}</div>
    }

    return (
      <div className="tm-user-center-feed-groups">
        {center.tasks.published.length > 0 ? (
          <UserCenterFeedGroup label={t('communityPage.mine.publishedTasks')}>
            {center.tasks.published.map((task) => (
              <UserCenterFeedCard
                key={task.id}
                tag={getCommunityTaskTypeLabel(task.taskType, t)}
                date={formatUserCenterDateTime(task.updatedAt)}
                title={task.title}
                stats={
                  canModerationResubmitTask(task)
                    ? undefined
                    : [{ kind: 'reply', label: getTaskUserCenterStatusLabel(task, t) }]
                }
                footerStats={
                  canModerationResubmitTask(task) ? (
                    <UserCenterRejectedFeedbackStat
                      target={buildTaskCommentTarget(task.id)}
                      comments={comments}
                      t={t}
                    />
                  ) : undefined
                }
                actions={
                  <>
                    {task.status === 'draft' ? (
                      <UserCenterActionLink
                        tone="primary"
                        onClick={() => {
                          setPublishNotice(null)
                          setEditTask(null)
                          setResumeTask(task)
                        }}
                      >
                        {t('communityPage.mine.submitReview')}
                      </UserCenterActionLink>
                    ) : null}
                    {canModerationResubmitTask(task) ? (
                      <>
                        <UserCenterActionLink
                          onClick={() => {
                            setPublishNotice(null)
                            setResumeTask(null)
                            setEditTask(task)
                          }}
                        >
                          {t('communityPage.mine.edit')}
                        </UserCenterActionLink>
                        <UserCenterActionLink
                          tone="primary"
                          onClick={() => {
                            setPublishNotice(null)
                            setEditTask(null)
                            setResumeTask(task)
                          }}
                        >
                          {t('communityPage.mine.resubmit')}
                        </UserCenterActionLink>
                        <UserCenterActionLink
                          tone="danger"
                          disabled={withdrawingId === task.id}
                          onClick={() => setTaskToDelete(task)}
                        >
                          {withdrawingId === task.id
                            ? t('communityPage.mine.deleting')
                            : t('communityPage.mine.delete')}
                        </UserCenterActionLink>
                      </>
                    ) : null}
                    {canWithdrawCommunityTask(task) ? (
                      <UserCenterActionLink
                        tone="danger"
                        disabled={withdrawingId === task.id}
                        onClick={() => setTaskToWithdraw(task)}
                      >
                        {withdrawingId === task.id
                          ? t('communityPage.mine.withdrawing')
                          : t('communityPage.mine.withdraw')}
                      </UserCenterActionLink>
                    ) : null}
                    {canDeleteCommunityTaskFromUserCenter(task) &&
                    !canModerationResubmitTask(task) &&
                    !canWithdrawCommunityTask(task) ? (
                      <UserCenterActionLink
                        tone="danger"
                        disabled={withdrawingId === task.id}
                        onClick={() => setTaskToDelete(task)}
                      >
                        {withdrawingId === task.id
                          ? t('communityPage.mine.deleting')
                          : t('communityPage.mine.delete')}
                      </UserCenterActionLink>
                    ) : null}
                  </>
                }
              />
            ))}
          </UserCenterFeedGroup>
        ) : null}
        {center.tasks.assigned.length > 0 ? (
          <UserCenterFeedGroup label={t('communityPage.mine.assignedTasks')}>
            {center.tasks.assigned.map((task) => (
              <UserCenterFeedCard
                key={task.id}
                tag={getCommunityTaskStatusLabel(task.status, t)}
                date={formatUserCenterDateTime(task.updatedAt)}
                title={task.title}
                stats={[{ kind: 'reply', label: task.publisher.displayName }]}
              />
            ))}
          </UserCenterFeedGroup>
        ) : null}
      </div>
    )
  }

  return (
    <div className="tm-community-market tm-community-user-center">
      <div className="tm-user-center-overview">
        <CommunityPanelHeader
          title={t('communityPage.panels.mine.title')}
          subtitle={
            profile
              ? translateCommunityDisplayName(profile.displayName, t)
              : t('communityPage.panels.mine.subtitle')
          }
          titleExtra={
            profile ? (
              <span className="tm-user-center-role-badge">
                {getCommunityUserRoleLabel(profile.role, t)}
              </span>
            ) : null
          }
          actions={
            <CommunityPanelRefreshButton
              loading={center.loading}
              disabled={center.loading}
              onClick={() => void center.load()}
            />
          }
        />

        <div
          className="tm-user-center-stat-grid"
          style={{ ['--tm-stat-cols' as string]: SECTIONS.length }}
          role="tablist"
          aria-label={t('communityPage.mine.dataSectionAria')}
        >
          {SECTIONS.map((item) => {
            const count = getSectionCount(item.key, center)
            const active = section === item.key
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
                onClick={() => setSection(item.key)}
              >
                <span className="tm-user-center-stat-label">{t(item.labelKey)}</span>
                <span className="tm-user-center-stat-value">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {profile?.bio ? <p className="tm-user-center-bio">{profile.bio}</p> : null}

      <div className="tm-user-center-feed">
        <div className="tm-user-center-feed-meta">
          {profile ? (
            <>
              <span>{t('communityPage.mine.listCount', { count: activeCount })}</span>
              <span>{t('communityPage.mine.sortByLatest')}</span>
            </>
          ) : (
            <span>{t('communityPage.mine.loginToView')}</span>
          )}
        </div>
        <div className="tm-user-center-feed-body">{renderSectionContent()}</div>
      </div>

      {resourceToWithdraw ? (
        <ConfirmDialog
          title={
            resourceToWithdraw.status === 'pending_review'
              ? t('communityPage.mine.confirm.withdrawResourceTitle')
              : t('communityPage.mine.confirm.deleteResourceTitle')
          }
          message={
            resourceToWithdraw.status === 'pending_review'
              ? t('communityPage.mine.confirm.withdrawResourceMessage', {
                  title: resourceToWithdraw.title,
                })
              : t('communityPage.mine.confirm.deleteResourceMessage', {
                  title: resourceToWithdraw.title,
                })
          }
          confirmLabel={
            resourceToWithdraw.status === 'pending_review'
              ? t('communityPage.mine.withdraw')
              : t('communityPage.mine.delete')
          }
          danger
          onCancel={() => setResourceToWithdraw(null)}
          onConfirm={() => void handleConfirmWithdraw()}
        />
      ) : null}

      {resumePublish || editPublish ? (
        <CommunityResourcePublishModal
          resourceType={(editPublish ?? resumePublish)!.resourceType}
          resourceLabel={
            getUserCenterResourceLabel((editPublish ?? resumePublish)!.resourceType, t) ??
            (editPublish ?? resumePublish)!.resourceType
          }
          resumeResource={editPublish ?? resumePublish}
          editOnly={Boolean(editPublish)}
          onClose={closePublishModal}
          onPublished={(message) => {
            setPublishNotice(message)
            closePublishModal()
            notifyCommunityUserDataChanged()
            void center.load()
          }}
        />
      ) : null}

      {resumeTask || editTask ? (
        <TaskCreateModal
          resumeTask={editTask ?? resumeTask}
          editOnly={Boolean(editTask)}
          onClose={closeTaskModal}
          onCreated={(message) => {
            setPublishNotice(message)
            closeTaskModal()
            void center.load()
          }}
        />
      ) : null}

      {resumeMessage || editMessage ? (
        <CommunityMessagePublishModal
          resumeMessage={editMessage ?? resumeMessage}
          editOnly={Boolean(editMessage)}
          onClose={closeMessageModal}
          onCreated={(message) => {
            setPublishNotice(message)
            closeMessageModal()
            void center.load()
          }}
        />
      ) : null}

      {messageToDelete ? (
        <ConfirmDialog
          title={t('communityPage.mine.confirm.deleteMessageTitle')}
          message={t('communityPage.mine.confirm.deleteMessageMessage')}
          confirmLabel={t('communityPage.mine.delete')}
          danger
          onCancel={() => setMessageToDelete(null)}
          onConfirm={() => void handleConfirmDeleteMessage()}
        />
      ) : null}

      {taskToWithdraw ? (
        <ConfirmDialog
          title={t('communityPage.mine.confirm.withdrawTaskTitle')}
          message={t('communityPage.mine.confirm.withdrawTaskMessage', {
            title: taskToWithdraw.title,
          })}
          confirmLabel={t('communityPage.mine.withdraw')}
          danger
          onCancel={() => setTaskToWithdraw(null)}
          onConfirm={() => void handleConfirmWithdrawTask()}
        />
      ) : null}

      {taskToDelete ? (
        <ConfirmDialog
          title={t('communityPage.mine.confirm.deleteTaskTitle')}
          message={t('communityPage.mine.confirm.deleteTaskMessage', { title: taskToDelete.title })}
          confirmLabel={t('communityPage.mine.delete')}
          danger
          onCancel={() => setTaskToDelete(null)}
          onConfirm={() => void handleConfirmDeleteTask()}
        />
      ) : null}
    </div>
  )
}
