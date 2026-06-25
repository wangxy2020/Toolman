import type { ReactNode } from 'react'

import {
  IconAccess,
  IconActivity,
  IconGlobe,
  IconKnowledge,
  IconUsers,
} from '../../components/icons'
import { getModerationCategoryLabels } from '../../i18n/community-moderation-labels'
import { useI18n } from '../../i18n/useI18n'
import { type ModerationCategory } from './community-moderation-utils'
import { useCommunityModerationCategoryOptional } from './community-moderation-category-context'
import { isCommunityModerator } from './community-user-utils'
import { useCommunityUser } from './useCommunityUser'

export function CommunityModerationCategoryNav() {
  const { t } = useI18n()
  const user = useCommunityUser()
  const isModerator = isCommunityModerator(user.profile?.role)
  const moderationCategory = useCommunityModerationCategoryOptional()
  const categoryLabels = getModerationCategoryLabels(t)

  const moderationCategories: Array<{
    key: ModerationCategory
    label: string
    icon: ReactNode
  }> = [
    { key: 'resources', label: categoryLabels.resources, icon: <IconKnowledge size={16} /> },
    { key: 'review', label: categoryLabels.review, icon: <IconAccess size={16} /> },
    { key: 'online', label: categoryLabels.online, icon: <IconGlobe size={16} /> },
    { key: 'admin', label: categoryLabels.admin, icon: <IconUsers size={16} /> },
    { key: 'logs', label: categoryLabels.logs, icon: <IconActivity size={16} /> },
  ]

  if (!isModerator || !moderationCategory) return null

  const { category, handleCategoryChange, pendingReviewCount } = moderationCategory

  return (
    <div
      className="tm-community-moderation-header-nav"
      role="tablist"
      aria-label={t('communityPage.admin.navAria')}
    >
      {moderationCategories.map((item) => {
        const active = category === item.key
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={item.label}
            aria-label={item.label}
            className={[
              'tm-community-moderation-header-nav-btn',
              active ? 'tm-community-moderation-header-nav-btn--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleCategoryChange(item.key)}
          >
            {item.icon}
            {item.key === 'review' && pendingReviewCount > 0 ? (
              <span className="tm-community-moderation-header-nav-badge" aria-hidden="true">
                {pendingReviewCount > 99 ? '99+' : pendingReviewCount}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
