import { type CommunityResourceType } from '@toolman/shared'

import { groupUserCenterResources } from './useCommunityUserCenter'
import { UserCenterFeedCard, UserCenterFeedGroup } from './user-center-feed-components'
import {
  formatUserCenterDateTime,
  getUserCenterResourceLabel,
} from './user-center-panel-utils'
import { getCommunityInstallStatusLabel } from '../../i18n/community-status-labels'
import type { UserCenterSectionPanel } from './user-center-section-types'

export function UserCenterInstallsSection({ panel }: { panel: UserCenterSectionPanel }) {
  const { t, center } = panel

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

export function UserCenterLikesSection({ panel }: { panel: UserCenterSectionPanel }) {
  const { t, center } = panel

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

export function UserCenterFavoritesSection({ panel }: { panel: UserCenterSectionPanel }) {
  const { t, center } = panel

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
