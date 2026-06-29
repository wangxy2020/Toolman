import { buildResourceCommentTarget } from './community-comment-utils'
import {
  canDeleteCommunityResourceFromUserCenter,
  canModerationResubmitResource,
  getResourceUserCenterDisplayStatusLabel,
} from './community-user-center-status'
import {
  UserCenterActionLink,
  UserCenterFeedCard,
  UserCenterRejectedFeedbackStat,
} from './user-center-feed-components'
import {
  formatUserCenterDateTime,
  getUserCenterResourceLabel,
} from './user-center-panel-utils'
import type { UserCenterSectionPanel } from './user-center-section-types'

function canWithdrawResource(item: { status: string }) {
  return item.status === 'draft' || item.status === 'pending_review'
}

export function UserCenterPublishesSection({ panel }: { panel: UserCenterSectionPanel }) {
  const {
    t,
    center,
    comments,
    withdrawingId,
    setPublishNotice,
    setResumePublish,
    setEditPublish,
    setResourceToWithdraw,
  } = panel

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
