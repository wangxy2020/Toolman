import { useEffect, useMemo, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { useSystemPaths } from '../chat/useSystemPaths'
import { useI18n } from '../../i18n/useI18n'
import {
  NOTES_OPEN_MODE_OPTIONS,
  notesOpenModeFromSettings,
  settingsPatchFromNotesOpenMode,
  type NotesEditorSettings,
  type NotesOpenMode,
} from './notes-editor-settings'
import {
  getDefaultNotesWorkingDirectory,
  normalizeStoredWorkingDirectory,
  resolveNotesWorkingDirectory,
} from './notes-path-utils'

interface Props {
  settings: NotesEditorSettings
  workingDirectory: string | null
  onClose: () => void
  onApply: (settings: NotesEditorSettings, workingDirectory: string | null) => void
  onExportBackup: () => void
  onImportBackup: (raw: string) => void
}

type SettingsTab = 'storage' | 'editor' | 'display'

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'storage', label: 'storage' },
  { id: 'editor', label: 'editor' },
  { id: 'display', label: 'display' },
]

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tm-agent-toggle ${checked ? 'tm-agent-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-agent-toggle-thumb" />
    </button>
  )
}

export function NotesSettingsModal({
  settings,
  workingDirectory,
  onClose,
  onApply,
  onExportBackup,
  onImportBackup,
}: Props) {
  const { t } = useI18n()
  const systemPaths = useSystemPaths()
  const defaultWorkingDirectory = getDefaultNotesWorkingDirectory(systemPaths)
  const resolvedWorkingDirectory = resolveNotesWorkingDirectory(workingDirectory, systemPaths)

  const [activeTab, setActiveTab] = useState<SettingsTab>('storage')
  const [draftSettings, setDraftSettings] = useState(settings)
  const [draftWorkingDirectory, setDraftWorkingDirectory] = useState(resolvedWorkingDirectory)
  const [directoryTouched, setDirectoryTouched] = useState(false)

  useEffect(() => {
    if (directoryTouched) return
    setDraftWorkingDirectory(resolveNotesWorkingDirectory(workingDirectory, systemPaths))
  }, [workingDirectory, systemPaths, directoryTouched])

  const dirty = useMemo(() => {
    const settingsChanged = JSON.stringify(draftSettings) !== JSON.stringify(settings)
    const nextStored = normalizeStoredWorkingDirectory(draftWorkingDirectory, systemPaths)
    const directoryChanged = nextStored !== workingDirectory
    return settingsChanged || directoryChanged
  }, [draftSettings, draftWorkingDirectory, settings, systemPaths, workingDirectory])

  const patchSettings = (patch: Partial<NotesEditorSettings>) => {
    setDraftSettings((prev) => ({ ...prev, ...patch }))
  }

  const handlePickDirectory = async () => {
    const result = await window.api.invoke(IpcChannel.DialogSelectFolder, {})
    if (!result.ok) return
    const { path } = result.data as { path: string | null }
    if (path) {
      setDirectoryTouched(true)
      setDraftWorkingDirectory(path)
    }
  }

  const handleResetDirectory = () => {
    setDirectoryTouched(true)
    setDraftWorkingDirectory(defaultWorkingDirectory)
  }

  const handleSave = () => {
    onApply(
      draftSettings,
      normalizeStoredWorkingDirectory(draftWorkingDirectory, systemPaths),
    )
    onClose()
  }

  const handleImportBackup = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : ''
        if (!raw.trim()) return
        if (!window.confirm(t('notesPage.settings.importConfirm'))) return
        onImportBackup(raw)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--notes-settings" onClick={onClose}>
      <div
        className="tm-notes-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-notes-settings-modal-header">
          <h3 id="notes-settings-title" className="tm-notes-settings-modal-title">
            <span className="tm-notes-settings-modal-title-dot" aria-hidden="true" />
            {t('notesPage.settings.title')}
          </h3>
          <button type="button" className="tm-notes-settings-modal-close" aria-label={t('common.close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-notes-settings-modal-body">
          <nav className="tm-notes-settings-modal-nav" aria-label={t('notesPage.settingsNavAria')}>
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-notes-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-notes-settings-modal-nav-item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}
              >
                {t(`notesPage.settings.tabs.${tab.label}`)}
              </button>
            ))}
          </nav>

          <div className="tm-notes-settings-modal-content">
            {activeTab === 'storage' ? (
              <div className="tm-notes-settings-form">
                <div className="tm-notes-settings-section-head">
                  <span className="tm-notes-settings-section-title">{t('notesPage.settings.dataSection')}</span>
                  <button
                    type="button"
                    className="tm-notes-settings-link-btn"
                    onClick={handleResetDirectory}
                  >
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
                      onChange={(event) => {
                        setDirectoryTouched(true)
                        setDraftWorkingDirectory(event.target.value)
                      }}
                    />
                    <button
                      type="button"
                      className="tm-notes-settings-workdir-browse"
                      onClick={() => void handlePickDirectory()}
                    >
                      {t('notesPage.settings.select')}
                    </button>
                  </div>
                  <p className="tm-notes-settings-hint">
                    {t('notesPage.settings.migrateHint')}
                  </p>
                </div>

                <div className="tm-notes-settings-divider-block">
                  <span className="tm-notes-settings-label">{t('notesPage.settings.backup')}</span>
                  <div className="tm-notes-settings-action-row">
                    <button
                      type="button"
                      className="tm-notes-settings-inline-btn"
                      onClick={onExportBackup}
                    >
                      {t('notesPage.settings.exportJson')}
                    </button>
                    <button
                      type="button"
                      className="tm-notes-settings-inline-btn"
                      onClick={handleImportBackup}
                    >
                      {t('notesPage.settings.importJson')}
                    </button>
                  </div>
                  <p className="tm-notes-settings-hint">
                    {t('notesPage.settings.backupHint')}
                  </p>
                </div>
              </div>
            ) : null}

            {activeTab === 'editor' ? (
              <div className="tm-notes-settings-form">
                <div className="tm-notes-settings-row tm-notes-settings-row--inline">
                  <label className="tm-notes-settings-label" htmlFor="notes-settings-open-mode">
                    {t('notesPage.settings.defaultOpenMode')}
                  </label>
                  <select
                    id="notes-settings-open-mode"
                    className="tm-notes-settings-input tm-notes-settings-input--compact"
                    value={notesOpenModeFromSettings(draftSettings)}
                    onChange={(event) =>
                      patchSettings(
                        settingsPatchFromNotesOpenMode(event.target.value as NotesOpenMode),
                      )
                    }
                  >
                    {NOTES_OPEN_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(`notesPage.openModes.${option.value === 'edit-only' ? 'editOnly' : option.value === 'live-preview' ? 'livePreview' : 'preview'}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="tm-notes-settings-hint">
                  {t('notesPage.settings.openModeHint')}
                </p>
              </div>
            ) : null}

            {activeTab === 'display' ? (
              <div className="tm-notes-settings-form">
                <span className="tm-notes-settings-section-title">{t('notesPage.settings.displaySection')}</span>

                <div className="tm-notes-settings-toggle-card">
                  <div className="tm-notes-settings-toggle-item">
                    <div className="tm-notes-settings-toggle-copy">
                      <span className="tm-notes-settings-toggle-label">{t('notesPage.settings.showOutline')}</span>
                      <p className="tm-notes-settings-hint">
                        {t('notesPage.settings.outlineHint')}
                      </p>
                    </div>
                    <Toggle
                      checked={draftSettings.showOutline}
                      onChange={(showOutline) => patchSettings({ showOutline })}
                    />
                  </div>

                  <div className="tm-notes-settings-toggle-item tm-notes-settings-toggle-item--bordered">
                    <div className="tm-notes-settings-toggle-copy">
                      <span className="tm-notes-settings-toggle-label">{t('notesPage.settings.narrowColumn')}</span>
                      <p className="tm-notes-settings-hint">
                        {t('notesPage.settings.narrowColumnHint')}
                      </p>
                    </div>
                    <Toggle
                      checked={draftSettings.narrowColumn}
                      onChange={(narrowColumn) => patchSettings({ narrowColumn })}
                    />
                  </div>
                </div>

                <div className="tm-notes-settings-slider-block">
                  <div className="tm-notes-settings-slider-head">
                    <label className="tm-notes-settings-label" htmlFor="notes-settings-font-size">
                      {t('notesPage.settings.fontSize')}
                    </label>
                    <span className="tm-notes-settings-slider-value">{draftSettings.fontSize}px</span>
                  </div>
                  <input
                    id="notes-settings-font-size"
                    type="range"
                    className="tm-notes-settings-slider"
                    min={10}
                    max={30}
                    value={draftSettings.fontSize}
                    onChange={(event) => patchSettings({ fontSize: Number(event.target.value) })}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="tm-notes-settings-modal-footer">
          <div className="tm-notes-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-notes-settings-modal-footer-btn tm-notes-settings-modal-footer-btn--secondary"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="tm-notes-settings-modal-footer-btn tm-notes-settings-modal-footer-btn--primary"
              disabled={!dirty}
              onClick={handleSave}
            >
              {t('notesPage.settings.saveSettings')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
