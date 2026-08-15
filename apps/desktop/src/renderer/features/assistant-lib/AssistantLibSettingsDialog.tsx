import {
  type AssistantLibPresetId,
  type KnowledgeBase,
  type Session,
  type VoiceTtsEngine,
} from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AgentSettingsToggle } from '../chat/agent-settings-modal-components'
import { AssistantSettingsHelpHint } from '../chat/assistant-settings-components'
import { CURATED_EDGE_TTS_VOICES } from '../voice/tts-provider-factory'
import { AssistantLibLocalKbPickerModal } from './AssistantLibLocalKbPickerModal'
import { AssistantLibMarkdownDocPane } from './AssistantLibMarkdownDocPane'
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
              <nav
                className="tm-kb-settings-modal-nav"
                aria-label={t('assistantLibPage.settingsNavAria')}
              >
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'basic' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('basic')}
                >
                  <span>{t('assistantLibPage.settingsBasicTab')}</span>
                </button>
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'teaching' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('teaching')}
                >
                  <span>{t('assistantLibPage.settingsTeachingTab')}</span>
                </button>
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'lesson' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('lesson')}
                >
                  <span>{t('assistantLibPage.settingsLessonTab')}</span>
                </button>
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'sync' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('sync')}
                >
                  <span>{t('assistantLibPage.settingsSyncTab')}</span>
                </button>
                <button
                  type="button"
                  className={[
                    'tm-kb-settings-modal-nav-item',
                    activeTab === 'danger' ? 'tm-kb-settings-modal-nav-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectTab('danger')}
                >
                  <span>{t('assistantLibPage.settingsDangerTab')}</span>
                </button>
              </nav>

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
                  <div className="tm-kb-settings-form">
                    <p className="tm-kb-settings-hint">{t('assistantLibPage.settingsHint')}</p>

                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="alib-settings-course-name">
                        {t('assistantLibPage.courseName')}
                      </label>
                      <input
                        id="alib-settings-course-name"
                        className="tm-kb-settings-input"
                        value={
                          isDefaultClassroom
                            ? t('assistantLibPage.defaultCourse')
                            : draft.courseName
                        }
                        onChange={(event) => updateDraft({ courseName: event.target.value })}
                        disabled={isDefaultClassroom}
                      />
                    </div>

                    <div className="tm-kb-settings-row tm-kb-settings-row--top">
                      <label className="tm-kb-settings-label" htmlFor="alib-settings-preset">
                        {t('assistantLibPage.teachingMode')}
                      </label>
                      <div className="tm-alib-settings-preset-field">
                        <select
                          id="alib-settings-preset"
                          className="tm-kb-settings-input"
                          value={draft.presetId}
                          onChange={(event) =>
                            handlePresetChange(event.target.value as AssistantLibPresetId)
                          }
                        >
                          {presets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {t(`assistantLibPage.presets.${preset.id}`)}
                            </option>
                          ))}
                        </select>
                        {selectedPreset ? (
                          <p className="tm-kb-settings-hint">
                            {t(`assistantLibPage.presetDescs.${selectedPreset.id}`)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="tm-kb-settings-row">
                      <span className="tm-kb-settings-label">
                        {t('assistantLibPage.settingsReferee')}
                      </span>
                      <label className="tm-alib-settings-toggle">
                        <input
                          type="checkbox"
                          checked={draft.refereeEnabled}
                          onChange={(event) =>
                            updateDraft({ refereeEnabled: event.target.checked })
                          }
                        />
                        <span>{t('assistantLibPage.settingsRefereeHint')}</span>
                      </label>
                    </div>

                    <div className="tm-kb-settings-row tm-kb-settings-row--top">
                      <div className="tm-alib-settings-label-group">
                        <span className="tm-kb-settings-label">
                          {t('assistantLibPage.textbookKb')}
                        </span>
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
                              name="alib-settings-textbook-source"
                              checked={draft.textbookSource === 'knowledge'}
                              onChange={() =>
                                updateDraft({
                                  textbookSource: 'knowledge',
                                  filePaths: [],
                                })
                              }
                            />
                            <span>{t('assistantLibPage.textbookSourceKb')}</span>
                          </label>
                          <label className="tm-kb-kind-radio">
                            <input
                              type="radio"
                              name="alib-settings-textbook-source"
                              checked={draft.textbookSource === 'local'}
                              onChange={() =>
                                updateDraft({
                                  textbookSource: 'local',
                                  kbId: '',
                                  kbPath: '',
                                })
                              }
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
                                draft.textbookSource === 'local'
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
                          {hasTextbookSelection ? (
                            <button
                              type="button"
                              className="tm-agent-workdir-reset"
                              onClick={handleClearTextbook}
                              disabled={busy}
                            >
                              {t('common.clear')}
                            </button>
                          ) : null}
                          <p className="tm-agent-field-hint">
                            {draft.textbookSource === 'local'
                              ? t('assistantLibPage.textbookLocalHint')
                              : t('assistantLibPage.textbookKbBrowseHint')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="tm-kb-settings-row">
                      <div className="tm-alib-settings-label-group">
                        <span className="tm-kb-settings-label">{t('agent.fields.autoSpeak')}</span>
                        <AssistantSettingsHelpHint
                          title={t('assistantLibPage.settingsAutoSpeakHint')}
                        />
                      </div>
                      <AgentSettingsToggle
                        checked={draft.autoSpeak}
                        onChange={(value) => updateDraft({ autoSpeak: value })}
                      />
                    </div>

                    <div className="tm-kb-settings-row">
                      <div className="tm-alib-settings-label-group">
                        <label className="tm-kb-settings-label" htmlFor="alib-settings-tts-engine">
                          {t('agent.fields.ttsEngine')}
                        </label>
                        <AssistantSettingsHelpHint title={t('agent.fields.ttsEngineHint')} />
                      </div>
                      <select
                        id="alib-settings-tts-engine"
                        className="tm-kb-settings-input"
                        value={draft.ttsEngine}
                        onChange={(event) =>
                          updateDraft({
                            ttsEngine: event.target.value as VoiceTtsEngine,
                          })
                        }
                      >
                        <option value="edge">{t('agent.fields.ttsEngineEdge')}</option>
                        <option value="web-speech">{t('agent.fields.ttsEngineWebSpeech')}</option>
                      </select>
                    </div>

                    {draft.ttsEngine === 'edge' ? (
                      <div className="tm-kb-settings-row">
                        <div className="tm-alib-settings-label-group">
                          <label className="tm-kb-settings-label" htmlFor="alib-settings-tts-voice">
                            {t('agent.fields.ttsVoice')}
                          </label>
                          <AssistantSettingsHelpHint title={t('agent.fields.ttsVoiceHint')} />
                        </div>
                        <select
                          id="alib-settings-tts-voice"
                          className="tm-kb-settings-input"
                          value={draft.ttsVoice}
                          onChange={(event) => updateDraft({ ttsVoice: event.target.value })}
                        >
                          {CURATED_EDGE_TTS_VOICES.map((voice) => (
                            <option key={voice.value} value={voice.value}>
                              {voice.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
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
                  <div className="tm-kb-settings-form tm-alib-settings-danger">
                    <span className="tm-group-settings-section-title">
                      {t('assistantLibPage.settingsDangerSection')}
                    </span>
                    <div className="tm-group-settings-danger-card">
                      {isDefaultClassroom ? (
                        <p className="tm-group-settings-hint">
                          {t('assistantLibPage.settingsDeleteDefaultBlocked')}
                        </p>
                      ) : (
                        <>
                          <p className="tm-group-settings-hint">
                            {t('assistantLibPage.settingsDeleteCourseHint')}
                          </p>
                          <button
                            type="button"
                            className="tm-group-settings-danger-btn"
                            disabled={busy || !onDeleteSession}
                            onClick={() => setConfirmDelete(true)}
                          >
                            {t('assistantLibPage.settingsDeleteCourseBtn')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
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
