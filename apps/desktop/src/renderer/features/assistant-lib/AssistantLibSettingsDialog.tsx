import {
  type KnowledgeBase,
  type Session,
} from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AssistantLibLocalKbPickerModal } from './AssistantLibLocalKbPickerModal'
import { AssistantLibMarkdownDocPane } from './AssistantLibMarkdownDocPane'
import { AssistantLibSettingsBasicTab } from './AssistantLibSettingsBasicTab'
import { AssistantLibSettingsNav } from './AssistantLibSettingsNav'
import { AssistantLibSettingsDangerTab } from './AssistantLibSettingsDangerTab'
import { AssistantLibSettingsSyncTab } from './AssistantLibSettingsSyncTab'
import { useAssistantLibSettingsDialog } from './hooks/useAssistantLibSettingsDialog'

export { useAssistantLibSettingsDialog } from './hooks/useAssistantLibSettingsDialog'

type Props = {
  workspaceId: string
  sessions: Session[]
  activeSessionId: string | null
  knowledgeBases: KnowledgeBase[]
  defaultLocalFolderPath: string | null
  onClose: () => void
  onSaved?: () => void | Promise<void>
  onKnowledgeBasesChanged?: () => void | Promise<void>
  onStatusMessage?: (message: string) => void
  onDeleteSession?: (sessionId: string) => void | Promise<void>
  defaultModelId?: string | null
}

export function AssistantLibSettingsDialog({
  workspaceId,
  sessions,
  activeSessionId,
  knowledgeBases,
  defaultLocalFolderPath,
  onClose,
  onSaved,
  onKnowledgeBasesChanged,
  onStatusMessage,
  onDeleteSession,
  defaultModelId,
}: Props) {
  const {
    t,
    targetSession,
    draft,
    activeTab,
    selectTab,
    busy,
    error,
    confirmDelete,
    setConfirmDelete,
    editingDoc,
    setEditingDoc,
    kbPickerOpen,
    setKbPickerOpen,
    isDefaultClassroom,
    courseLabel,
    presets,
    selectedPreset,
    pathDisplay,
    hasTextbookSelection,
    syllabus,
    syllabusGenerating,
    syllabusStatusText,
    updateDraft,
    handlePresetChange,
    handleBrowse,
    handleClearTextbook,
    handleDeleteCourse,
    handleSave,
    handleGenerateSyllabus,
  } = useAssistantLibSettingsDialog({
    workspaceId,
    sessions,
    activeSessionId,
    knowledgeBases,
    defaultLocalFolderPath,
    onClose,
    onSaved,
    onKnowledgeBasesChanged,
    onStatusMessage,
    onDeleteSession,
    defaultModelId,
  })

  return (
    <div className="tm-modal-overlay tm-modal-overlay--kb-settings" onClick={onClose}>
      <div
        className="tm-kb-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alib-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-kb-settings-modal-header">
          <h3 id="alib-settings-title" className="tm-kb-settings-modal-title">
            <span className="tm-kb-settings-modal-title-dot" aria-hidden="true" />
            {t('assistantLibPage.settingsTitleNamed', { name: courseLabel })}
          </h3>
          <button
            type="button"
            className="tm-kb-settings-modal-close"
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

        {!targetSession || !draft ? (
          <>
            <div className="tm-kb-settings-modal-content">
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">{t('assistantLibPage.settingsEmpty')}</p>
              </div>
            </div>
            <footer className="tm-kb-settings-modal-footer">
              <div className="tm-kb-settings-modal-footer-actions">
                <button
                  type="button"
                  className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
                  onClick={onClose}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </footer>
          </>
        ) : (
          <>
            <div className="tm-kb-settings-modal-body">
              <AssistantLibSettingsNav t={t} activeTab={activeTab} selectTab={selectTab} />

              <div
                className={[
                  'tm-kb-settings-modal-content',
                  activeTab === 'teaching' || activeTab === 'lesson' ? 'tm-alib-lesson-content' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {error ? (
                  <p className="tm-kb-settings-hint tm-pm-project-info-error">{error}</p>
                ) : null}

                {activeTab === 'basic' ? (
                  <AssistantLibSettingsBasicTab
                    state={{
                      t,
                      draft,
                      isDefaultClassroom,
                      presets,
                      selectedPreset,
                      pathDisplay,
                      hasTextbookSelection,
                      busy,
                      updateDraft,
                      handlePresetChange,
                      handleBrowse,
                      handleClearTextbook,
                    }}
                  />
                ) : null}

                {activeTab === 'teaching' ? (
                  <AssistantLibMarkdownDocPane
                    hint={t('assistantLibPage.teachingPromptHint')}
                    editLabel={t('assistantLibPage.teachingPromptEdit')}
                    doneLabel={t('assistantLibPage.teachingPromptDone')}
                    emptyLabel={t('assistantLibPage.teachingPromptEmpty')}
                    ariaLabel={t('assistantLibPage.settingsTeachingTab')}
                    value={draft.customSystemPrompt}
                    editing={editingDoc}
                    busy={busy}
                    onEditingChange={setEditingDoc}
                    onChange={(value) => updateDraft({ customSystemPrompt: value })}
                  />
                ) : null}

                {activeTab === 'lesson' ? (
                  <AssistantLibMarkdownDocPane
                    hint={t('assistantLibPage.lessonPlanHint')}
                    editLabel={t('assistantLibPage.lessonPlanEdit')}
                    doneLabel={t('assistantLibPage.lessonPlanDone')}
                    emptyLabel={t('assistantLibPage.lessonPlanEmpty')}
                    ariaLabel={t('assistantLibPage.settingsLessonTab')}
                    value={draft.lessonPlan}
                    editing={editingDoc && !syllabusGenerating}
                    busy={busy || syllabusGenerating}
                    headerActions={
                      defaultModelId ? (
                        <button
                          type="button"
                          className="tm-kb-settings-inline-btn"
                          disabled={busy || syllabusGenerating}
                          onClick={handleGenerateSyllabus}
                        >
                          {syllabusGenerating
                            ? t('assistantLibPage.syllabusGenerating')
                            : t('assistantLibPage.syllabusGenerate')}
                        </button>
                      ) : null
                    }
                    banner={
                      syllabus ? (
                        <div className="tm-alib-syllabus-progress">
                          <span>{syllabusStatusText}</span>
                        </div>
                      ) : null
                    }
                    onEditingChange={setEditingDoc}
                    onChange={(value) => updateDraft({ lessonPlan: value })}
                  />
                ) : null}

                {activeTab === 'sync' ? <AssistantLibSettingsSyncTab /> : null}

                {activeTab === 'danger' ? (
                  <AssistantLibSettingsDangerTab
                    state={{
                      t,
                      isDefaultClassroom,
                      busy,
                      setConfirmDelete,
                      onDeleteSession,
                    }}
                  />
                ) : null}
              </div>
            </div>

            <footer className="tm-kb-settings-modal-footer">
              <div className="tm-kb-settings-modal-footer-actions">
                <button
                  type="button"
                  className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
                  disabled={busy}
                  onClick={onClose}
                >
                  {t('common.cancel')}
                </button>
                {activeTab !== 'danger' && activeTab !== 'sync' ? (
                  <button
                    type="button"
                    className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
                    disabled={busy || !draft}
                    onClick={() => void handleSave()}
                  >
                    {busy ? t('agent.processing') : t('common.save')}
                  </button>
                ) : null}
              </div>
            </footer>
          </>
        )}
      </div>

      {kbPickerOpen ? (
        <AssistantLibLocalKbPickerModal
          workspaceId={workspaceId}
          knowledgeBases={knowledgeBases}
          defaultLocalFolderPath={defaultLocalFolderPath}
          selectedKbId={draft?.kbId || null}
          onClose={() => setKbPickerOpen(false)}
          onSelect={(kb, path) => {
            updateDraft({ kbId: kb.id, kbPath: path, textbookSource: 'knowledge' })
            setKbPickerOpen(false)
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title={t('assistantLibPage.settingsDeleteCourseTitle')}
          message={t('assistantLibPage.settingsDeleteCourseConfirm', { name: courseLabel })}
          confirmLabel={t('assistantLibPage.settingsDeleteCourseTitle')}
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDeleteCourse()}
        />
      ) : null}
    </div>
  )
}
