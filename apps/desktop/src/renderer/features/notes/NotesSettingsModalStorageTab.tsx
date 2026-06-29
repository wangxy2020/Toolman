interface Props {
  t: (key: string) => string
  draftWorkingDirectory: string
  defaultWorkingDirectory: string
  onDirectoryChange: (value: string) => void
  onPickDirectory: () => void
  onResetDirectory: () => void
  onExportBackup: () => void
  onImportBackup: () => void
}

export function NotesSettingsModalStorageTab({
  t,
  draftWorkingDirectory,
  defaultWorkingDirectory,
  onDirectoryChange,
  onPickDirectory,
  onResetDirectory,
  onExportBackup,
  onImportBackup,
}: Props) {
  return (
    <div className="tm-notes-settings-form">
      <div className="tm-notes-settings-section-head">
        <span className="tm-notes-settings-section-title">{t('notesPage.settings.dataSection')}</span>
        <button type="button" className="tm-notes-settings-link-btn" onClick={onResetDirectory}>
          {t('notesPage.settings.resetDefault')}
        </button>
      </div>

      <div className="tm-notes-settings-field-block">
        <label className="tm-notes-settings-label" htmlFor="notes-settings-directory">
          {t('notesPage.settings.workingDirectory')}
        </label>
        <div className="tm-notes-settings-workdir-group">
          <input
            id="notes-settings-directory"
            className="tm-notes-settings-workdir-input"
            value={draftWorkingDirectory}
            placeholder={defaultWorkingDirectory || t('common.loading')}
            title={draftWorkingDirectory}
            onChange={(event) => onDirectoryChange(event.target.value)}
          />
          <button
            type="button"
            className="tm-notes-settings-workdir-browse"
            onClick={onPickDirectory}
          >
            {t('notesPage.settings.select')}
          </button>
        </div>
        <p className="tm-notes-settings-hint">{t('notesPage.settings.migrateHint')}</p>
      </div>

      <div className="tm-notes-settings-divider-block">
        <span className="tm-notes-settings-label">{t('notesPage.settings.backup')}</span>
        <div className="tm-notes-settings-action-row">
          <button type="button" className="tm-notes-settings-inline-btn" onClick={onExportBackup}>
            {t('notesPage.settings.exportJson')}
          </button>
          <button type="button" className="tm-notes-settings-inline-btn" onClick={onImportBackup}>
            {t('notesPage.settings.importJson')}
          </button>
        </div>
        <p className="tm-notes-settings-hint">{t('notesPage.settings.backupHint')}</p>
      </div>
    </div>
  )
}
