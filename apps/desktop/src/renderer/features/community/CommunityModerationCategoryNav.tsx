import type { ReactNode } from 'react'

import {
  IconAccess,
  IconActivity,
  IconGlobe,
  IconKnowledge,
  IconUsers,
} from '../../components/icons'
import {
  MODERATION_CATEGORY_LABELS,
  type ModerationCategory,
} from './community-moderation-utils'
import { useCommunityModerationCategoryOptional } from './community-moderation-category-context'
import { isCommunityModerator } from './community-user-utils'
import { useCommunityUser } from './useCommunityUser'

const MODERATION_CATEGORIES: Array<{
  key: ModerationCategory
  label: string
  icon: ReactNode
}> = [
  { key: 'resources', label: MODERATION_CATEGORY_LABELS.resources, icon: <IconKnowledge size={16} /> },
  { key: 'review', label: MODERATION_CATEGORY_LABELS.review, icon: <IconAccess size={16} /> },
  { key: 'online', label: MODERATION_CATEGORY_LABELS.online, icon: <IconGlobe size={16} /> },
  { key: 'admin', label: MODERATION_CATEGORY_LABELS.admin, icon: <IconUsers size={16} /> },
  { key: 'logs', label: MODERATION_CATEGORY_LABELS.logs, icon: <IconActivity size={16} /> },
]

export function CommunityModerationCategoryNav() {
  const user = useCommunityUser()
  const isModerator = isCommunityModerator(user.profile?.role)
  const moderationCategory = useCommunityModerationCategoryOptional()

  if (!isModerator || !moderationCategory) return null

  const { category, handleCategoryChange } = moderationCategory

  return (
    <div
      className="tm-community-moderation-header-nav"
      role="tablist"
      aria-label="管理分类"
    >
      {MODERATION_CATEGORIES.map((item) => {
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
          </button>
        )
      })}
    </div>
  )
}
