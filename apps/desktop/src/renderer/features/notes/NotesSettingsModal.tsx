import { useEffect, useMemo, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
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

type SettingsTab = 'storage' | 'editor' | 'display'

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'storage', label: '存储与数据' },
  { id: 'editor', label: '编辑器设置' },
  { id: 'display', label: '显示与外观' },
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
        if (!window.confirm('导入将覆盖当前所有笔记数据，是否继续？')) return
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
            笔记设置
          </h3>
          <button type="button" className="tm-notes-settings-modal-close" aria-label="关闭" onClick={onClose}>
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
          <nav className="tm-notes-settings-modal-nav" aria-label="笔记设置分类">
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
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="tm-notes-settings-modal-content">
            {activeTab === 'storage' ? (
              <div className="tm-notes-settings-form">
                <div className="tm-notes-settings-section-head">
                  <span className="tm-notes-settings-section-title">数据设置</span>
                  <button
                    type="button"
                    className="tm-notes-settings-link-btn"
                    onClick={handleResetDirectory}
                  >
                    重置为默认
                  </button>
                </div>

                <div className="tm-notes-settings-field-block">
                  <label className="tm-notes-settings-label" htmlFor="notes-settings-directory">
                    当前工作目录
                  </label>
                  <div className="tm-notes-settings-workdir-group">
                    <input
                      id="notes-settings-directory"
                      className="tm-notes-settings-workdir-input"
                      value={draftWorkingDirectory}
                      placeholder={defaultWorkingDirectory || '加载中…'}
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
                      选择
                    </button>
                  </div>
                  <p className="tm-notes-settings-hint">
                    更改工作目录不会移动现有文件，请手动迁移文件。
                  </p>
                </div>

                <div className="tm-notes-settings-divider-block">
                  <span className="tm-notes-settings-label">数据备份</span>
                  <div className="tm-notes-settings-action-row">
                    <button
                      type="button"
                      className="tm-notes-settings-inline-btn"
                      onClick={onExportBackup}
                    >
                      导出笔记 JSON
                    </button>
                    <button
                      type="button"
                      className="tm-notes-settings-inline-btn"
                      onClick={handleImportBackup}
                    >
                      导入笔记 JSON
                    </button>
                  </div>
                  <p className="tm-notes-settings-hint">
                    笔记保存在本机浏览器存储中，建议定期导出备份。
                  </p>
                </div>
              </div>
            ) : null}

            {activeTab === 'editor' ? (
              <div className="tm-notes-settings-form">
                <div className="tm-notes-settings-row">
                  <label className="tm-notes-settings-label" htmlFor="notes-settings-default-view">
                    默认视图
                  </label>
                  <select
                    id="notes-settings-default-view"
                    className="tm-notes-settings-input"
                    value={draftSettings.defaultView}
                    onChange={(event) =>
                      patchSettings({
                        defaultView: event.target.value as NotesEditorSettings['defaultView'],
                      })
                    }
                  >
                    {NOTES_DEFAULT_VIEW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="tm-notes-settings-hint">新笔记默认的视图模式</p>

                <div className="tm-notes-settings-row">
                  <label className="tm-notes-settings-label" htmlFor="notes-settings-default-edit-view">
                    默认编辑视图
                  </label>
                  <select
                    id="notes-settings-default-edit-view"
                    className="tm-notes-settings-input"
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
                </div>
                <p className="tm-notes-settings-hint">在编辑视图下，新笔记默认采用的编辑模式</p>
              </div>
            ) : null}

            {activeTab === 'display' ? (
              <div className="tm-notes-settings-form">
                <span className="tm-notes-settings-section-title">显示与外观</span>

                <div className="tm-notes-settings-toggle-card">
                  <div className="tm-notes-settings-toggle-item">
                    <div className="tm-notes-settings-toggle-copy">
                      <span className="tm-notes-settings-toggle-label">显示大纲</span>
                      <p className="tm-notes-settings-hint">
                        在笔记编辑区右侧显示标题大纲，点击可快速跳转
                      </p>
                    </div>
                    <Toggle
                      checked={draftSettings.showOutline}
                      onChange={(showOutline) => patchSettings({ showOutline })}
                    />
                  </div>

                  <div className="tm-notes-settings-toggle-item tm-notes-settings-toggle-item--bordered">
                    <div className="tm-notes-settings-toggle-copy">
                      <span className="tm-notes-settings-toggle-label">缩减栏宽</span>
                      <p className="tm-notes-settings-hint">
                        开启后将限制每行字数，使屏幕显示的内容更聚焦
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
                      字体大小
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
              取消
            </button>
            <button
              type="button"
              className="tm-notes-settings-modal-footer-btn tm-notes-settings-modal-footer-btn--primary"
              disabled={!dirty}
              onClick={handleSave}
            >
              保存设置
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
