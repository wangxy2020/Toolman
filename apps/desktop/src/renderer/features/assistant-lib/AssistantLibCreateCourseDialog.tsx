import type { KnowledgeBase } from '@toolman/shared'
import {
  AssistantSettingsHelpHint,
  AssistantSettingsRequiredMark,
} from '../chat/assistant-settings-components'
import { AssistantLibLocalKbPickerModal } from './AssistantLibLocalKbPickerModal'
import type { AssistantLibCreateCourseInput } from './assistant-lib-create-course-utils'
import { useAssistantLibCreateCourseDialog } from './hooks/useAssistantLibCreateCourseDialog'

export type { AssistantLibCreateCourseInput }
export { useAssistantLibCreateCourseDialog } from './hooks/useAssistantLibCreateCourseDialog'

type Props = {
  workspaceId: string
  knowledgeBases: KnowledgeBase[]
  defaultLocalFolderPath: string | null
  busy: boolean
  onClose: () => void
  onStart: (input: AssistantLibCreateCourseInput) => void | Promise<void>
}

export function AssistantLibCreateCourseDialog({
  workspaceId,
  knowledgeBases,
  defaultLocalFolderPath,
  busy,
  onClose,
  onStart,
}: Props) {
  const {
    t,
    presets,
    courseName,
    setCourseName,
    presetId,
    setPresetId,
    textbookSource,
    selectedKbId,
    kbPickerOpen,
    setKbPickerOpen,
    formError,
    setFormError,
    selectedPreset,
    pathDisplay,
    hasSelection,
    handleBrowse,
    handleClearSelection,
    handleSubmit,
    selectTextbookSource,
    selectKnowledgeBase,
  } = useAssistantLibCreateCourseDialog({ defaultLocalFolderPath, onStart })

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
                        setPresetId(event.target.value as typeof presetId)
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
                          onChange={() => selectTextbookSource('knowledge')}
                        />
                        <span>{t('assistantLibPage.textbookSourceKb')}</span>
                      </label>
                      <label className="tm-kb-kind-radio">
                        <input
                          type="radio"
                          name="alib-textbook-source"
                          checked={textbookSource === 'local'}
                          onChange={() => selectTextbookSource('local')}
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
          onSelect={(kb, path) => selectKnowledgeBase(kb.id, path)}
        />
      ) : null}
    </>
  )
}
