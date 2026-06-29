import { translateGroupName } from '../../i18n/system-labels'
import type { UseGroupSettingsModalResult } from './useGroupSettingsModal'

type GroupSettingsGeneralTabProps = Pick<
  UseGroupSettingsModalResult,
  't' | 'name' | 'setName' | 'description' | 'setDescription' | 'isOwner'
>

export function GroupSettingsGeneralTab({
  t,
  name,
  setName,
  description,
  setDescription,
  isOwner,
}: GroupSettingsGeneralTabProps) {
  return (
    <div className="tm-group-settings-form">
      <span className="tm-group-settings-section-title">{t('groupPage.settings.generalSection')}</span>

      <div className="tm-group-settings-field">
        <label className="tm-group-settings-label" htmlFor="group-settings-name">
          {t('groupPage.settings.groupName')} <span className="tm-group-settings-required">*</span>
        </label>
        <input
          id="group-settings-name"
          className="tm-group-settings-input"
          value={translateGroupName(name, t)}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('groupPage.settings.namePlaceholder')}
          maxLength={100}
          readOnly={!isOwner}
          disabled={!isOwner}
        />
      </div>

      <div className="tm-group-settings-field">
        <label className="tm-group-settings-label" htmlFor="group-settings-description">
          {t('common.description')}
        </label>
        <textarea
          id="group-settings-description"
          className="tm-group-settings-textarea"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('groupPage.settings.descriptionPlaceholder')}
          maxLength={500}
          rows={3}
          readOnly={!isOwner}
          disabled={!isOwner}
        />
      </div>

      {!isOwner ? (
        <p className="tm-group-settings-hint">{t('groupPage.settings.ownerHint')}</p>
      ) : null}
    </div>
  )
}
