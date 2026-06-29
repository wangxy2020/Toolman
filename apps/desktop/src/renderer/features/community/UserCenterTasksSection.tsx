import { buildTaskCommentTarget } from './community-comment-utils'
import {
  canDeleteCommunityTaskFromUserCenter,
  canModerationResubmitTask,
  canWithdrawCommunityTask,
  getTaskUserCenterStatusLabel,
} from './community-user-center-status'
import {
  UserCenterActionLink,
  UserCenterFeedCard,
  UserCenterFeedGroup,
  UserCenterRejectedFeedbackStat,
} from './user-center-feed-components'
import { formatUserCenterDateTime } from './user-center-panel-utils'
import type { UserCenterSectionPanel } from './user-center-section-types'
import {
  getCommunityTaskStatusLabel,
  getCommunityTaskTypeLabel,
} from '../../i18n/community-status-labels'

export function UserCenterTasksSection({ panel }: { panel: UserCenterSectionPanel }) {
  const {
    t,
    center,
    comments,
    withdrawingId,
    setPublishNotice,
    setResumeTask,
    setEditTask,
    setTaskToDelete,
    setTaskToWithdraw,
  } = panel

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
