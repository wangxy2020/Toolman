import { CommunityPanelHeader, CommunityPanelRefreshButton } from './CommunityPanelHeader'
import { AdminModerationConfirmDialog } from './AdminModerationConfirmDialog'
import { AdminModerationFeedBody } from './AdminModerationFeedBody'
import { useAdminModerationPanel } from './useAdminModerationPanel'
import { getCommunityUserRoleLabel } from '../../i18n/community-user-labels'

export function AdminModerationPanel() {
  const panel = useAdminModerationPanel()
  const {
    t,
    isModerator,
    isFounder,
    moderation,
    category,
    subTab,
    setSubTab,
    pending,
    setPending,
    categoryStatCards,
    activeListCount,
    scannedAtLabel,
    handleRefresh,
    handleConfirm,
    moderationCategoryLabels,
    reportActionLabels,
    profileRole,
  } = panel

  const confirmDialog = pending ? (
    <AdminModerationConfirmDialog
      pending={pending}
      onCancel={() => setPending(null)}
      onConfirm={() => void handleConfirm()}
      t={t}
      reportActionLabels={reportActionLabels}
    />
  ) : null

  if (!isModerator) {
    return (
      <div className="tm-community-market tm-community-user-center">
        <CommunityPanelHeader
          title={t('communityPage.panels.management.title')}
          subtitle={t('communityPage.panels.management.subtitle')}
        />
        <div className="tm-user-center-feed">
          <div className="tm-user-center-empty">{t('communityPage.admin.needPermission')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="tm-community-market tm-community-user-center">
      <div className="tm-user-center-overview">
        <CommunityPanelHeader
          title={t('communityPage.panels.management.title')}
          subtitle={isFounder ? t('communityPage.admin.founderConsole') : t('communityPage.admin.adminConsole')}
          titleExtra={
            profileRole ? (
              <span className="tm-user-center-role-badge">
                {getCommunityUserRoleLabel(profileRole, t)}
              </span>
            ) : null
          }
          actions={
            <CommunityPanelRefreshButton
              title={t('communityPage.admin.scanNow')}
              loading={moderation.loading}
              disabled={moderation.loading || moderation.acting}
              onClick={handleRefresh}
            />
          }
        />

        <div
          className="tm-user-center-stat-grid"
          style={{ ['--tm-stat-cols' as string]: categoryStatCards.length }}
          role="tablist"
          aria-label={`${moderationCategoryLabels[category]}${t('communityPage.admin.dataSectionSuffix')}`}
        >
          {categoryStatCards.map((item) => {
            const active = subTab === item.key
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
                onClick={() => setSubTab(item.key)}
              >
                <span className="tm-user-center-stat-label">{item.label}</span>
                <span className="tm-user-center-stat-value">{item.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="tm-user-center-feed">
        <div className="tm-user-center-feed-meta">
          <span>{t('communityPage.admin.listCount', { count: activeListCount })}</span>
          <span>
            {t('communityPage.admin.lastScan', { time: scannedAtLabel })}
            {moderation.loading ? t('communityPage.admin.scanning') : ''}
          </span>
        </div>

        <div className="tm-user-center-feed-body">
          <AdminModerationFeedBody panel={panel} setPending={setPending} />
        </div>
      </div>

      {confirmDialog}
    </div>
  )
}
