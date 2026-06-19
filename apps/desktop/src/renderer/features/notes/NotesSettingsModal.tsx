import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IpcChannel } from '@toolman/shared'
import { IconHelp } from '../../components/icons'
import { useSystemPaths } from '../chat/useSystemPaths'
import {
  NOTES_DEFAULT_EDIT_VIEW_OPTIONS,
  NOTES_DEFAULT_VIEW_OPTIONS,
  type NotesEditorSettings,
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

function FormLabel({
  children,
  hint,
}: {
  children: ReactNode
  hint?: string
}) {
  return (
    <span className="tm-form-label">
      {children}
      {hint ? (
        <span className="tm-form-label-hint" title={hint}>
          <IconHelp size={13} />
        </span>
      ) : null}
    </span>
  )
}

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
      className={`tm-msg-toggle ${checked ? 'tm-msg-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-msg-toggle-thumb" />
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
  const systemPaths = useSystemPaths()
  const defaultWorkingDirectory = getDefaultNotesWorkingDirectory(systemPaths)
  const resolvedWorkingDirectory = resolveNotesWorkingDirectory(workingDirectory, systemPaths)

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
        if (!window.confirm('导入将覆盖当前所有笔记数据，是否继续？')) return
        onImportBackup(raw)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-modal tm-modal--knowledge-create"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">笔记设置</h2>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="tm-modal-body tm-knowledge-settings-body">
          <section className="tm-knowledge-settings-section">
            <div className="tm-knowledge-settings-heading-row">
              <h3 className="tm-knowledge-settings-heading">数据设置</h3>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-btn--sm"
                onClick={handleResetDirectory}
              >
                重置为默认
              </button>
            </div>
            <label className="tm-form-field">
              <FormLabel>当前工作目录</FormLabel>
              <div className="tm-form-picker-row">
                <input
                  className="tm-form-input"
                  value={draftWorkingDirectory}
                  placeholder={defaultWorkingDirectory || '加载中…'}
                  onChange={(event) => {
                    setDirectoryTouched(true)
                    setDraftWorkingDirectory(event.target.value)
                  }}
                />
                <button type="button" className="tm-btn" onClick={() => void handlePickDirectory()}>
                  选择
                </button>
              </div>
              <p className="tm-form-hint">更改工作目录不会移动现有文件，请手动迁移文件。</p>
            </label>
            <div className="tm-notes-settings-actions">
              <button type="button" className="tm-btn tm-btn--ghost tm-btn--sm" onClick={onExportBackup}>
                导出笔记 JSON
              </button>
              <button type="button" className="tm-btn tm-btn--ghost tm-btn--sm" onClick={handleImportBackup}>
                导入笔记 JSON
              </button>
            </div>
            <p className="tm-form-hint">笔记保存在本机浏览器存储中，建议定期导出备份。</p>
          </section>

          <section className="tm-knowledge-settings-section">
            <h3 className="tm-knowledge-settings-heading">编辑器设置</h3>
            <label className="tm-form-field">
              <FormLabel hint="新笔记默认的视图模式">默认视图</FormLabel>
              <select
                className="tm-form-input"
                value={draftSettings.defaultView}
                onChange={(event) =>
                  patchSettings({ defaultView: event.target.value as NotesEditorSettings['defaultView'] })
                }
              >
                {NOTES_DEFAULT_VIEW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tm-form-field">
              <FormLabel hint="在编辑视图下，新笔记默认采用的编辑模式">默认编辑视图</FormLabel>
              <select
                className="tm-form-input"
                value={draftSettings.defaultEditView}
                disabled={draftSettings.defaultView === 'preview'}
                onChange={(event) =>
                  patchSettings({
                    defaultEditView: event.target.value as NotesEditorSettings['defaultEditView'],
                  })
                }
              >
                {NOTES_DEFAULT_EDIT_VIEW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="tm-knowledge-settings-section">
            <h3 className="tm-knowledge-settings-heading">显示设置</h3>
            <div className="tm-form-field">
              <div className="tm-notes-settings-inline">
                <FormLabel>显示大纲</FormLabel>
                <Toggle
                  checked={draftSettings.showOutline}
                  onChange={(showOutline) => patchSettings({ showOutline })}
                />
              </div>
              <p className="tm-form-hint">在笔记编辑区右侧显示标题大纲，点击可快速跳转</p>
            </div>

            <div className="tm-form-field">
              <div className="tm-notes-settings-inline">
                <FormLabel>缩减栏宽</FormLabel>
                <Toggle
                  checked={draftSettings.narrowColumn}
                  onChange={(narrowColumn) => patchSettings({ narrowColumn })}
                />
              </div>
              <p className="tm-form-hint">开启后将限制每行字数，使屏幕显示的内容减少</p>
            </div>

            <label className="tm-form-field">
              <FormLabel hint="调整字体大小以获得更好的阅读体验（10-30px）">字体大小</FormLabel>
              <div className="tm-notes-settings-slider-row">
                <input
                  type="range"
                  className="tm-msg-font-slider"
                  min={10}
                  max={30}
                  value={draftSettings.fontSize}
                  onChange={(event) =>
                    patchSettings({ fontSize: Number(event.target.value) })
                  }
                />
                <span className="tm-notes-settings-slider-value">{draftSettings.fontSize}px</span>
              </div>
            </label>
          </section>
        </div>

        <footer className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={!dirty}
            onClick={handleSave}
          >
            保存
          </button>
        </footer>
      </div>
    </div>
  )
}
