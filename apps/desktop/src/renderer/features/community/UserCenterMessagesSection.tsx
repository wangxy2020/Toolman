import {
  UserCenterActionLink,
  UserCenterFeedCard,
} from './user-center-feed-components'
import { formatUserCenterDateTime } from './user-center-panel-utils'
import type { UserCenterSectionPanel } from './user-center-section-types'

export function UserCenterMessagesSection({ panel }: { panel: UserCenterSectionPanel }) {
  const {
    t,
    center,
    withdrawingId,
    setPublishNotice,
    setResumeMessage,
    setEditMessage,
    setMessageToDelete,
  } = panel

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
