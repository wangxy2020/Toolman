import { useMemo, useState } from 'react'
import {
  IpcChannel,
  listSelectableAssistantLibPresets,
  type AssistantLibPresetId,
  type KnowledgeBase,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import {
  AssistantSettingsHelpHint,
  AssistantSettingsRequiredMark,
} from '../chat/assistant-settings-components'
import { getPathBasename } from '../knowledge/knowledge-path-utils'
import { AssistantLibLocalKbPickerModal } from './AssistantLibLocalKbPickerModal'

type TextbookSource = 'knowledge' | 'local'

export type AssistantLibCreateCourseInput = {
  courseName: string
  presetId: AssistantLibPresetId
  kbIds?: string[]
  /** Selected local-disk files; caller creates a local KB folder and uploads them. */
  textbookFilePaths?: string[]
  textbookSource: TextbookSource
}

type Props = {
  workspaceId: string
  knowledgeBases: KnowledgeBase[]
  defaultLocalFolderPath: string | null
  busy: boolean
  onClose: () => void
  onStart: (input: AssistantLibCreateCourseInput) => void | Promise<void>
}

function formatSelectedFiles(paths: string[]): string {
  if (paths.length === 0) return ''
  if (paths.length === 1) return paths[0]
  return `${getPathBasename(paths[0])} 等 ${paths.length} 个文件`
}

export function AssistantLibCreateCourseDialog({
  workspaceId,
  knowledgeBases,
  defaultLocalFolderPath,
  busy,
  onClose,
  onStart,
}: Props) {
  const { t } = useI18n()
  const presets = useMemo(() => listSelectableAssistantLibPresets(), [])

  const [courseName, setCourseName] = useState('')
  const [presetId, setPresetId] = useState<AssistantLibPresetId>('socratic-tutor')
  const [textbookSource, setTextbookSource] = useState<TextbookSource>('knowledge')
  const [selectedKbId, setSelectedKbId] = useState('')
  const [selectedKbPath, setSelectedKbPath] = useState('')
  const [filePaths, setFilePaths] = useState<string[]>([])
  const [kbPickerOpen, setKbPickerOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const selectedPreset = presets.find((item) => item.id === presetId) ?? presets[0]

  const pathDisplay = useMemo(() => {
    if (textbookSource === 'local') return formatSelectedFiles(filePaths)
    return selectedKbPath
  }, [filePaths, selectedKbPath, textbookSource])

  const handleBrowse = async () => {
    setFormError(null)

    if (textbookSource === 'knowledge') {
      setKbPickerOpen(true)
      return
    }

    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      multiple: true,
      defaultPath: defaultLocalFolderPath ?? undefined,
    })
    if (!pickResult.ok) return
    const { paths } = pickResult.data as { paths: string[] }
    if (!paths?.length) return
    setFilePaths(paths)
  }

  const handleClearSelection = () => {
    if (textbookSource === 'knowledge') {
      setSelectedKbId('')
      setSelectedKbPath('')
    } else {
      setFilePaths([])
    }
    setFormError(null)
  }

  const handleSubmit = () => {
    const trimmedName = courseName.trim()
    if (!trimmedName) {
      setFormError(t('assistantLibPage.courseNameRequired'))
      return
    }

    if (textbookSource === 'knowledge') {
      if (!selectedKbId) {
        setFormError(t('assistantLibPage.selectKbRequired'))
        return
      }
      void onStart({
        courseName: trimmedName,
        presetId: selectedPreset?.id ?? 'socratic-tutor',
        textbookSource: 'knowledge',
        kbIds: [selectedKbId],
      })
      return
    }

    if (filePaths.length === 0) {
      setFormError(t('assistantLibPage.textbookFilesRequired'))
      return
    }

    void onStart({
      courseName: trimmedName,
      presetId: selectedPreset?.id ?? 'socratic-tutor',
      textbookSource: 'local',
      textbookFilePaths: filePaths,
    })
  }

  const hasSelection =
    textbookSource === 'knowledge' ? Boolean(selectedKbId || selectedKbPath) : filePaths.length > 0

  return (
    <>
      <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
        <div
          className="tm-agent-modal tm-agent-modal--create"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alib-create-course-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="tm-agent-modal-header">
            <h3 id="alib-create-course-title" className="tm-agent-modal-title">
              <span className="tm-agent-modal-title-dot" aria-hidden="true" />
              {t('assistantLibPage.addCourse')}
            </h3>
            <button
              type="button"
              className="tm-agent-modal-close"
              aria-label={t('common.close')}
              onClick={onClose}
            >
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

          <div className="tm-agent-modal-body tm-agent-modal-body--single">
            <div className="tm-agent-modal-content">
              <div className="tm-agent-settings-form">
                <div className="tm-agent-setting-row">
                  <label className="tm-agent-setting-label" htmlFor="alib-create-course-name">
                    {t('assistantLibPage.courseName')}
                    <AssistantSettingsRequiredMark />
                  </label>
                  <input
                    id="alib-create-course-name"
                    className="tm-agent-setting-input"
                    value={courseName}
                    onChange={(event) => {
                      setCourseName(event.target.value)
                      setFormError(null)
                    }}
                    placeholder={t('assistantLibPage.courseNamePlaceholder')}
                    autoFocus
                  />
                </div>

                <div className="tm-agent-setting-row">
                  <div className="tm-agent-setting-label-group">
                    <label className="tm-agent-setting-label" htmlFor="alib-create-preset">
                      {t('assistantLibPage.teachingMode')}
                    </label>
                    <AssistantSettingsRequiredMark />
                  </div>
                  <div className="tm-agent-setting-block">
                    <select
                      id="alib-create-preset"
                      className="tm-agent-model-select"
                      value={presetId}
                      onChange={(event) =>
                        setPresetId(event.target.value as AssistantLibPresetId)
                      }
                    >
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {t(`assistantLibPage.presets.${preset.id}`)}
                        </option>
                      ))}
                    </select>
                    {selectedPreset ? (
                      <p className="tm-agent-field-hint">
                        {t(`assistantLibPage.presetDescs.${selectedPreset.id}`)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="tm-agent-setting-row tm-agent-setting-row--top">
                  <div className="tm-agent-setting-label-group">
                    <span className="tm-agent-setting-label">{t('assistantLibPage.textbookKb')}</span>
                    <AssistantSettingsHelpHint title={t('assistantLibPage.textbookKbHint')} />
                  </div>
                  <div className="tm-agent-setting-block">
                    <div
                      className="tm-kb-kind-radio-group"
                      role="radiogroup"
                      aria-label={t('assistantLibPage.textbookKb')}
                    >
                      <label className="tm-kb-kind-radio">
                        <input
                          type="radio"
                          name="alib-textbook-source"
                          checked={textbookSource === 'knowledge'}
                          onChange={() => {
                            setTextbookSource('knowledge')
                            setFilePaths([])
                            setFormError(null)
                          }}
                        />
                        <span>{t('assistantLibPage.textbookSourceKb')}</span>
                      </label>
                      <label className="tm-kb-kind-radio">
                        <input
                          type="radio"
                          name="alib-textbook-source"
                          checked={textbookSource === 'local'}
                          onChange={() => {
                            setTextbookSource('local')
                            setSelectedKbId('')
                            setSelectedKbPath('')
                            setFormError(null)
                          }}
                        />
                        <span>{t('assistantLibPage.textbookSourceLocal')}</span>
                      </label>
                    </div>

                    <div className="tm-agent-workdir-field tm-alib-textbook-path">
                      <div className="tm-agent-workdir-input-group">
                        <input
                          className="tm-agent-workdir-input"
                          readOnly
                          value={pathDisplay}
                          placeholder={
                            textbookSource === 'local'
                              ? t('assistantLibPage.textbookLocalPlaceholder')
                              : t('assistantLibPage.selectKb')
                          }
                          title={pathDisplay || undefined}
                        />
                        <button
                          type="button"
                          className="tm-agent-workdir-browse"
                          onClick={() => void handleBrowse()}
                          disabled={busy}
                        >
                          {t('assistantLibPage.selectFiles')}
                        </button>
                      </div>
                      {hasSelection ? (
                        <button
                          type="button"
                          className="tm-agent-workdir-reset"
                          onClick={handleClearSelection}
                          disabled={busy}
                        >
                          {t('common.clear')}
                        </button>
                      ) : null}
                      <p className="tm-agent-field-hint">
                        {textbookSource === 'local'
                          ? t('assistantLibPage.textbookLocalHint')
                          : t('assistantLibPage.textbookKbBrowseHint')}
                      </p>
                    </div>
                  </div>
                </div>

                {formError ? <p className="tm-agent-form-error">{formError}</p> : null}
              </div>
            </div>
          </div>

          <footer className="tm-agent-modal-footer">
            <button
              type="button"
              className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
              disabled={busy}
              onClick={handleSubmit}
            >
              {busy ? t('agent.processing') : t('common.add')}
            </button>
          </footer>
        </div>
      </div>

      {kbPickerOpen ? (
        <AssistantLibLocalKbPickerModal
          workspaceId={workspaceId}
          knowledgeBases={knowledgeBases}
          defaultLocalFolderPath={defaultLocalFolderPath}
          selectedKbId={selectedKbId || null}
          onClose={() => setKbPickerOpen(false)}
          onSelect={(kb, path) => {
            setSelectedKbId(kb.id)
            setSelectedKbPath(path)
            setKbPickerOpen(false)
            setFormError(null)
          }}
        />
      ) : null}
    </>
  )
}
