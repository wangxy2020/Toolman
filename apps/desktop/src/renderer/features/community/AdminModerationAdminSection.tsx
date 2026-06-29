import { formatCommunityDate } from './community-market-utils'
import { ModerationList } from './ModerationList'
import { getCommunityUserRoleLabel } from '../../i18n/community-user-labels'
import type { AdminModerationPanelState } from './useAdminModerationPanel'
import type { PendingAction } from './admin-moderation-panel-types'

type PanelSlice = Pick<
  AdminModerationPanelState,
  | 't'
  | 'language'
  | 'category'
  | 'subTab'
  | 'isFounder'
  | 'isModerator'
  | 'moderation'
  | 'adminManagement'
  | 'hubHealth'
  | 'hubHealthError'
  | 'blacklistEntries'
  | 'adminSearch'
  | 'setAdminSearch'
>

export function AdminModerationAdminSection({
  panel,
  setPending,
}: {
  panel: PanelSlice
  setPending: (action: PendingAction) => void
}) {
  const {
    t,
    language,
    category,
    subTab,
    isFounder,
    isModerator,
    moderation,
    adminManagement,
    hubHealth,
    hubHealthError,
    blacklistEntries,
    adminSearch,
    setAdminSearch,
  } = panel

  if (category !== 'admin') return null

  if (subTab === 'blacklist') {
    if (blacklistEntries.length === 0) {
      return <div className="tm-user-center-empty">{t('communityPage.admin.emptyBlacklist')}</div>
    }
    return (
      <div className="tm-community-moderation-table-wrap">
        <div className="tm-community-moderation-table-head">
          <span>{t('communityPage.admin.columns.index')}</span>
          <span>{t('communityPage.admin.columns.userName')}</span>
          <span>{t('communityPage.admin.columns.deviceId')}</span>
          <span>{t('communityPage.admin.columns.action')}</span>
        </div>
        <div className="tm-community-moderation-table-body">
          {blacklistEntries.map((entry, index) => (
            <div key={entry.key} className="tm-community-moderation-table-row">
              <span className="tm-community-moderation-table-index">{index + 1}</span>
              <span className="tm-community-moderation-table-user" title={entry.userName}>
                {entry.userName}
              </span>
              <span className="tm-community-moderation-table-device" title={entry.deviceId}>
                {entry.deviceId}
              </span>
              <div className="tm-community-moderation-table-actions">
                <button
                  type="button"
                  className="tm-btn tm-btn--ghost"
                  disabled={moderation.acting}
                  onClick={() =>
                    setPending(
                      entry.kind === 'user'
                        ? {
                            kind: 'unban-user',
                            userId: entry.userId,
                            label: entry.userName,
                          }
                        : {
                            kind: 'unban-device',
                            deviceId: entry.deviceRecordId,
                            label: entry.deviceId,
                          },
                    )
                  }
                >
                  {t('communityPage.admin.unban')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (subTab === 'registeredUsers') {
    return (
      <div className="tm-user-center-empty">
        {hubHealthError
          ? t('communityPage.admin.registeredUsersError', { error: hubHealthError })
          : t('communityPage.admin.registeredUsers', {
              count: hubHealth?.userCount ?? '—',
            })}
      </div>
    )
  }

  if (subTab === 'admins' && isModerator) {
    return (
      <div className="tm-community-moderation-admins">
        <ModerationList
          empty={
            adminManagement.loading
              ? t('communityPage.admin.loadingAdmins')
              : t('communityPage.admin.emptyAdmins')
          }
          items={adminManagement.moderators}
          renderItem={(moderator) => (
            <div key={moderator.id} className="tm-community-moderation-row">
              <div className="tm-community-moderation-row-main">
                <div className="tm-community-moderation-row-title">{moderator.displayName}</div>
                <div className="tm-community-moderation-row-meta">
                  {getCommunityUserRoleLabel(moderator.role, t)} ·{' '}
                  {formatCommunityDate(moderator.createdAt, language)}
                </div>
              </div>
              <div className="tm-community-moderation-row-actions">
                {moderator.role === 'founder' ? (
                  <span className="tm-community-moderation-scan-meta">{t('communityPage.admin.founder')}</span>
                ) : isFounder ? (
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                    disabled={adminManagement.acting}
                    onClick={() =>
                      setPending({
                        kind: 'revoke-admin',
                        userId: moderator.id,
                        label: moderator.displayName,
                      })
                    }
                  >
                    {t('communityPage.admin.revokeAdmin')}
                  </button>
                ) : (
                  <span className="tm-community-moderation-scan-meta">{t('communityPage.admin.admin')}</span>
                )}
              </div>
            </div>
          )}
        />

        {isFounder ? (
          <>
            <p className="tm-community-moderation-subtitle">{t('communityPage.admin.appointHint')}</p>
            <div className="tm-community-moderation-admin-search">
              <input
                type="search"
                className="tm-community-moderation-admin-search-input"
                placeholder={t('communityPage.admin.searchAdminPlaceholder')}
                value={adminSearch}
                onChange={(event) => {
                  const value = event.target.value
                  setAdminSearch(value)
                  void adminManagement.searchUsers(value)
                }}
              />
              {adminManagement.searching ? (
                <span className="tm-community-moderation-scan-meta">{t('communityPage.admin.searching')}</span>
              ) : null}
            </div>

            <ModerationList
              empty={
                adminSearch.trim()
                  ? t('communityPage.admin.noMatchUsers')
                  : t('communityPage.admin.searchUsersEmpty')
              }
              items={adminSearch.trim() ? adminManagement.searchResults : []}
              renderItem={(candidate) => (
                <div key={candidate.id} className="tm-community-moderation-row">
                  <div className="tm-community-moderation-row-main">
                    <div className="tm-community-moderation-row-title">{candidate.displayName}</div>
                    <div className="tm-community-moderation-row-meta">
                      {getCommunityUserRoleLabel(candidate.role, t)} · {candidate.id.slice(0, 8)}…
                    </div>
                  </div>
                  <div className="tm-community-moderation-row-actions">
                    {candidate.role === 'admin' || candidate.role === 'founder' ? (
                      <span className="tm-community-moderation-scan-meta">
                        {t('communityPage.admin.alreadyAdmin')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="tm-btn tm-btn--primary"
                        disabled={adminManagement.acting}
                        onClick={() =>
                          setPending({
                            kind: 'appoint-admin',
                            userId: candidate.id,
                            label: candidate.displayName,
                          })
                        }
                      >
                        {t('communityPage.admin.appointAdmin')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            />
          </>
        ) : null}
      </div>
    )
  }

  return null
}
