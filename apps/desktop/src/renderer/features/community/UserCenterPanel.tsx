import { CommunityPanelHeader, CommunityPanelRefreshButton } from './CommunityPanelHeader'
import { UserCenterPanelModals } from './UserCenterPanelModals'
import { UserCenterSectionContent } from './UserCenterSectionContent'
import { useUserCenterPanel } from './useUserCenterPanel'
import { USER_CENTER_SECTIONS, getSectionCount } from './user-center-panel-utils'
import {
  getCommunityUserRoleLabel,
  translateCommunityDisplayName,
} from '../../i18n/community-user-labels'

export function UserCenterPanel() {
  const panel = useUserCenterPanel()
  const { t, section, setSection, center, profile, activeCount } = panel

  return (
    <div className="tm-community-market tm-community-user-center">
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

      <div className="tm-kb-file-panel tm-community-user-center-body">
        <div
          className="tm-user-center-stat-grid"
          style={{ ['--tm-stat-cols' as string]: USER_CENTER_SECTIONS.length }}
          role="tablist"
          aria-label={t('communityPage.mine.dataSectionAria')}
        >
          {USER_CENTER_SECTIONS.map((item) => {
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
          <div className="tm-user-center-feed-body">
            <UserCenterSectionContent panel={panel} />
          </div>
        </div>
      </div>

      <UserCenterPanelModals panel={panel} />
    </div>
  )
}
