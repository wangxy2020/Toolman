import {
  UserCenterFavoritesSection,
  UserCenterInstallsSection,
  UserCenterLikesSection,
} from './UserCenterEngagementSections'
import { UserCenterMessagesSection } from './UserCenterMessagesSection'
import { UserCenterPublishesSection } from './UserCenterPublishesSection'
import { UserCenterTasksSection } from './UserCenterTasksSection'
import type { UserCenterPanelState } from './useUserCenterPanel'

export function UserCenterSectionContent({ panel }: { panel: UserCenterPanelState }) {
  const { t, section, center, profile } = panel

  if (center.profileLoading || center.loading) {
    return <div className="tm-user-center-empty">{t('communityPage.mine.loading')}</div>
  }
  if (!profile) {
    return <div className="tm-user-center-empty">{t('communityPage.mine.loginRequired')}</div>
  }

  switch (section) {
    case 'publishes':
      return <UserCenterPublishesSection panel={panel} />
    case 'messages':
      return <UserCenterMessagesSection panel={panel} />
    case 'installs':
      return <UserCenterInstallsSection panel={panel} />
    case 'likes':
      return <UserCenterLikesSection panel={panel} />
    case 'favorites':
      return <UserCenterFavoritesSection panel={panel} />
    case 'tasks':
      return <UserCenterTasksSection panel={panel} />
  }
}
