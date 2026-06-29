import type { UseGroupSettingsModalResult } from './useGroupSettingsModal'

type GroupSettingsDangerTabProps = Pick<
  UseGroupSettingsModalResult,
  't' | 'isOwner' | 'actionBusy' | 'setConfirmAction'
>

export function GroupSettingsDangerTab({
  t,
  isOwner,
  actionBusy,
  setConfirmAction,
}: GroupSettingsDangerTabProps) {
  return (
    <div className="tm-group-settings-form">
      <span className="tm-group-settings-section-title">{t('groupPage.settings.dangerSection')}</span>

      <div className="tm-group-settings-danger-card">
        {isOwner ? (
          <>
            <p className="tm-group-settings-hint">{t('groupPage.settings.dissolveHint')}</p>
            <button
              type="button"
              className="tm-group-settings-danger-btn"
              disabled={actionBusy}
              onClick={() => setConfirmAction('dissolve')}
            >
              {t('groupPage.settings.dissolveBtn')}
            </button>
          </>
        ) : (
          <>
            <p className="tm-group-settings-hint">{t('groupPage.settings.leaveHint')}</p>
            <button
              type="button"
              className="tm-group-settings-danger-btn"
              disabled={actionBusy}
              onClick={() => setConfirmAction('leave')}
            >
              {t('groupPage.settings.leaveBtn')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
