import { formatCommunityDate } from './community-market-utils'
import { ModerationList } from './ModerationList'
import { isOnlineSubTab } from './admin-moderation-panel-utils'
import type { AdminModerationPanelState } from './useAdminModerationPanel'
import type { PendingAction } from './admin-moderation-panel-types'

type PanelSlice = Pick<
  AdminModerationPanelState,
  | 't'
  | 'language'
  | 'category'
  | 'subTab'
  | 'moderation'
  | 'deviceSearch'
  | 'setDeviceSearch'
  | 'filteredDevicesByKind'
>

export function AdminModerationOnlineSection({
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
    moderation,
    deviceSearch,
    setDeviceSearch,
    filteredDevicesByKind,
  } = panel

  if (category !== 'online' || !isOnlineSubTab(subTab)) return null

  return (
    <div className="tm-community-moderation-devices">
      <div className="tm-community-moderation-admin-search">
        <input
          type="search"
          className="tm-community-moderation-admin-search-input"
          placeholder={t('communityPage.admin.searchDevicesPlaceholder')}
          value={deviceSearch}
          onChange={(event) => setDeviceSearch(event.target.value)}
        />
      </div>
      <ModerationList
        empty={
          deviceSearch.trim()
            ? t('communityPage.admin.noMatchDevices')
            : subTab === 'mobile'
              ? t('communityPage.admin.emptyDevices', { kind: t('communityPage.admin.mobile') })
              : t('communityPage.admin.emptyDevices', { kind: t('communityPage.admin.desktop') })
        }
        items={filteredDevicesByKind}
        renderItem={(device) => (
          <div key={device.deviceId} className="tm-community-moderation-row">
            <div className="tm-community-moderation-row-main">
              <div className="tm-community-moderation-row-title">{device.deviceName}</div>
              <div className="tm-community-moderation-row-meta">
                {t('communityPage.admin.deviceMeta', {
                  kind:
                    device.deviceKind === 'mobile'
                      ? t('communityPage.admin.mobile')
                      : t('communityPage.admin.desktop'),
                  userName: device.userName,
                  time: formatCommunityDate(device.lastSeenAt, language),
                })}
              </div>
              <div className="tm-community-moderation-row-desc">
                {t('communityPage.admin.deviceIdLabel', { id: device.deviceId })}
              </div>
            </div>
            <div className="tm-community-moderation-row-actions">
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                disabled={moderation.acting}
                onClick={() =>
                  setPending({
                    kind: 'ban-device',
                    deviceId: device.deviceId,
                    userId: device.userId,
                    deviceName: device.deviceName,
                    userName: device.userName,
                  })
                }
              >
                {t('communityPage.admin.banDevice')}
              </button>
            </div>
          </div>
        )}
      />
    </div>
  )
}
