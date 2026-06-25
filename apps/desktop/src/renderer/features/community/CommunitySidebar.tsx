import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { getCommunitySidebarSectionLabel } from '../../i18n/community-sidebar-labels'
import {
  COMMUNITY_SIDEBAR_SECTIONS,
  type CommunitySidebarSection,
} from './community-sidebar-types'
import { IconPlus } from '../../components/icons'
import { isCommunityModerator } from './community-user-utils'
import { useCommunityUser } from './useCommunityUser'
import { isCommunitySessionActive } from '../user/community-session'

interface Props {
  activeSection: CommunitySidebarSection
  onSelectSection: (section: CommunitySidebarSection) => void
}

export function CommunitySidebar({ activeSection, onSelectSection }: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig('community', t)
  const user = useCommunityUser()
  const canAccessManagement =
    isCommunitySessionActive() && isCommunityModerator(user.profile?.role)

  const sections = COMMUNITY_SIDEBAR_SECTIONS.filter(
    (section) => section.id !== 'management' || canAccessManagement,
  )

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" disabled title={t('common.comingSoon')}>
          <IconPlus />
          {config.addLabel}
        </button>

        <div className="tm-sidebar-list">
          {sections.map((section) => {
            const isActive = activeSection === section.id

            return (
              <div key={section.id} className="tm-assistant-group">
                <div
                  className={[
                    'tm-assistant-row',
                    isActive ? 'tm-assistant-row--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="tm-assistant-expand tm-assistant-expand--placeholder" />
                  <button
                    type="button"
                    className={[
                      'tm-assistant-name',
                      isActive ? 'tm-assistant-name--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectSection(section.id)}
                  >
                    {getCommunitySidebarSectionLabel(section.id, t)}
                  </button>
                  <div className="tm-assistant-actions tm-assistant-actions--placeholder" aria-hidden="true" />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
