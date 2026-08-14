import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  IpcChannel,
  assistantLibSessionMetadataPatch,
  formatSyllabusMarkdown,
  getAssistantLibPreset,
  isAssistantLibDefaultClassroomSession,
  isAssistantLibGuideCourseSession,
  listSelectableAssistantLibPresets,
  parseAssistantLibSessionMeta,
  parseCourseSyllabus,
  type AssistantLibPresetId,
  type KnowledgeBase,
  type Session,
  type VoiceTtsEngine,
} from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useI18n } from '../../i18n/useI18n'
import { AgentSettingsToggle } from '../chat/agent-settings-modal-components'
import { AssistantSettingsHelpHint } from '../chat/assistant-settings-components'
import { MessageMarkdown } from '../chat/MessageMarkdown'
import { DEFAULT_MESSAGE_SETTINGS } from '../chat/message-settings'
import { getPathBasename } from '../knowledge/knowledge-path-utils'
import { CURATED_EDGE_TTS_VOICES, resolveCuratedEdgeTtsVoice } from '../voice/tts-provider-factory'
import {
  AssistantLibLocalKbPickerModal,
  resolveTextbookKbDisplayPath,
} from './AssistantLibLocalKbPickerModal'
import { createLocalTextbookKnowledgeBase } from './create-textbook-kb'
import { safeInvoke } from '../../lib/ipc-client'

type TextbookSource = 'knowledge' | 'local'
type SettingsTab = 'basic' | 'teaching' | 'lesson' | 'danger'

const LESSON_PLAN_MARKDOWN_SETTINGS = {
  ...DEFAULT_MESSAGE_SETTINGS,
  fancyCodeBlocks: false,
  wrapCodeBlocks: true,
}

function AssistantLibMarkdownDocPane({
  hint,
  editLabel,
  doneLabel,
  emptyLabel,
  ariaLabel,
  value,
  editing,
  busy,
  banner,
  headerActions,
  onEditingChange,
  onChange,
}: {
  hint: string
  editLabel: string
  doneLabel: string
  emptyLabel: string
  ariaLabel: string
  value: string
  editing: boolean
  busy: boolean
  banner?: ReactNode
  headerActions?: ReactNode
  onEditingChange: (editing: boolean) => void
  onChange: (value: string) => void
}) {
  return (
    <>
      <div className="tm-alib-lesson-plan-header">
        <div className="tm-alib-lesson-plan-header-copy">
          <p className="tm-kb-settings-hint">{hint}</p>
          {banner}
        </div>
        <div className="tm-alib-lesson-plan-header-actions">
          {headerActions}
          <button
            type="button"
            className="tm-kb-settings-inline-btn"
            disabled={busy}
            onClick={() => onEditingChange(!editing)}
          >
            {editing ? doneLabel : editLabel}
          </button>
        </div>
      </div>
      <div className="tm-alib-lesson-plan-body">
        {editing ? (
          <textarea
            className="tm-alib-lesson-plan-editor"
            rows={Math.max(16, value.split('\n').length + 2)}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={ariaLabel}
          />
        ) : value.trim() ? (
          <div className="tm-alib-lesson-plan-preview">
            <MessageMarkdown text={value} settings={LESSON_PLAN_MARKDOWN_SETTINGS} />
          </div>
        ) : (
          <p className="tm-kb-settings-hint">{emptyLabel}</p>
        )}
      </div>
    </>
  )
}

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

type ClassroomDraft = {
  courseName: string
  presetId: AssistantLibPresetId
  refereeEnabled: boolean
  textbookSource: TextbookSource
  kbId: string
  kbPath: string
  filePaths: string[]
  customSystemPrompt: string
  lessonPlan: string
  autoSpeak: boolean
  ttsEngine: VoiceTtsEngine
  ttsVoice: string
}

function resolveCourseLabel(session: Session, defaultLabel: string, guideLabel: string): string {
  if (isAssistantLibDefaultClassroomSession(session.metadata)) return defaultLabel
  if (isAssistantLibGuideCourseSession(session.metadata)) return guideLabel
  const meta = parseAssistantLibSessionMeta(session.metadata)
  return meta?.courseName?.trim() || session.title || defaultLabel
}

function formatSelectedFiles(paths: string[]): string {
  if (paths.length === 0) return ''
  if (paths.length === 1) return paths[0]
  return `${getPathBasename(paths[0])} 等 ${paths.length} 个文件`
}

function draftFromSession(
  session: Session,
  knowledgeBases: KnowledgeBase[],
  defaultLocalFolderPath: string | null,
): ClassroomDraft {
  const meta = parseAssistantLibSessionMeta(session.metadata)
  const presetId = (meta?.presetId as AssistantLibPresetId | undefined) ?? 'socratic-tutor'
  const preset = getAssistantLibPreset(presetId)
  const kbId = meta?.kbIds?.[0] ?? ''
  const kb = knowledgeBases.find((item) => item.id === kbId) ?? null
  return {
    courseName: meta?.courseName?.trim() || session.title || '',
    presetId,
    refereeEnabled: meta?.refereeEnabled ?? preset?.refereeEnabled ?? true,
    textbookSource: 'knowledge',
    kbId,
    kbPath: kb ? resolveTextbookKbDisplayPath(kb, defaultLocalFolderPath) : '',
    filePaths: [],
    customSystemPrompt: meta?.customSystemPrompt?.trim() || preset?.systemPrompt || '',
    lessonPlan:
      meta?.lessonPlan?.trim() ||
      (meta?.syllabus ? formatSyllabusMarkdown(meta.syllabus) : '') ||
      '',
    autoSpeak: meta?.autoSpeak ?? true,
    ttsEngine: meta?.ttsEngine === 'web-speech' ? 'web-speech' : 'edge',
    ttsVoice: resolveCuratedEdgeTtsVoice(meta?.ttsVoice),
  }
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
  const { t } = useI18n()
  const selectablePresets = useMemo(() => listSelectableAssistantLibPresets(), [])

  const targetSession = useMemo(() => {
    if (activeSessionId) {
      const active = sessions.find((item) => item.id === activeSessionId)
      if (active) return active
    }
    return (
      sessions.find((session) => isAssistantLibGuideCourseSession(session.metadata)) ??
      sessions.find((session) => !isAssistantLibDefaultClassroomSession(session.metadata)) ??
      sessions[0] ??
      null
    )
  }, [activeSessionId, sessions])

  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const [draft, setDraft] = useState<ClassroomDraft | null>(null)
  const [kbPickerOpen, setKbPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingDoc, setEditingDoc] = useState(false)
  const isDefaultClassroom = Boolean(
    targetSession && isAssistantLibDefaultClassroomSession(targetSession.metadata),
  )
  const isGuideClassroom = Boolean(
    targetSession && isAssistantLibGuideCourseSession(targetSession.metadata),
  )
  const targetSessionId = targetSession?.id ?? null

  useEffect(() => {
    if (!targetSession) {
      setDraft(null)
      setActiveTab('basic')
      setEditingDoc(false)
      return
    }
    setDraft(draftFromSession(targetSession, knowledgeBases, defaultLocalFolderPath))
    setActiveTab('basic')
    setEditingDoc(false)
    setError(null)
    // Reset the tab only when switching classrooms, not when session objects refresh.
  }, [targetSessionId])

  useEffect(() => {
    setDraft((prev) => {
      if (!prev) return prev
      const kb = knowledgeBases.find((item) => item.id === prev.kbId) ?? null
      const kbPath = kb ? resolveTextbookKbDisplayPath(kb, defaultLocalFolderPath) : prev.kbPath
      if (kbPath === prev.kbPath) return prev
      return { ...prev, kbPath }
    })
  }, [knowledgeBases, defaultLocalFolderPath])

  useEffect(() => {
    if (!targetSession || editingDoc) return
    const meta = parseAssistantLibSessionMeta(targetSession.metadata)
    const markdown =
      meta?.lessonPlan?.trim() ||
      (meta?.syllabus ? formatSyllabusMarkdown(meta.syllabus) : '')
    setDraft((prev) => {
      if (!prev || prev.lessonPlan === markdown) return prev
      return { ...prev, lessonPlan: markdown }
    })
  }, [editingDoc, targetSession])

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab)
    setEditingDoc(false)
  }

  const syllabus = targetSession
    ? parseCourseSyllabus(parseAssistantLibSessionMeta(targetSession.metadata)?.syllabus)
    : null
  const syllabusGenerating = syllabus?.generation === 'generating'
  const handleGenerateSyllabus = () => {
    if (!targetSession) return
    if (!defaultModelId) {
      setError(t('assistantLibPage.syllabusNeedModel'))
      return
    }
    setError(null)
    void safeInvoke(IpcChannel.AssistantLibSyllabusGenerate, {
      workspaceId,
      sessionId: targetSession.id,
      modelId: defaultModelId,
    }).then((result) => {
      if (!result.ok) setError(result.error.message)
    })
  }

  const courseLabel = targetSession
    ? resolveCourseLabel(
        targetSession,
        t('assistantLibPage.defaultCourse'),
        t('assistantLibPage.guideCourse'),
      )
    : t('assistantLibPage.defaultCourse')
  const presets = useMemo(() => {
    if (!draft) return selectablePresets
    if (selectablePresets.some((item) => item.id === draft.presetId)) return selectablePresets
    const current = getAssistantLibPreset(draft.presetId)
    return current ? [current, ...selectablePresets] : selectablePresets
  }, [draft, selectablePresets])
  const selectedPreset = draft
    ? (presets.find((item) => item.id === draft.presetId) ?? getAssistantLibPreset(draft.presetId) ?? presets[0])
    : null

  const pathDisplay = useMemo(() => {
    if (!draft) return ''
    if (draft.textbookSource === 'local') return formatSelectedFiles(draft.filePaths)
    return draft.kbPath
  }, [draft])

  const hasTextbookSelection = Boolean(
    draft &&
      (draft.textbookSource === 'knowledge'
        ? draft.kbId || draft.kbPath
        : draft.filePaths.length > 0),
  )

  const updateDraft = (patch: Partial<ClassroomDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setError(null)
  }

  const handleBrowse = async () => {
    if (!draft) return
    setError(null)
    if (draft.textbookSource === 'knowledge') {
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
    updateDraft({ filePaths: paths })
  }

  const handleClearTextbook = () => {
    if (!draft) return
    if (draft.textbookSource === 'knowledge') {
      updateDraft({ kbId: '', kbPath: '' })
    } else {
      updateDraft({ filePaths: [] })
    }
  }

  const handleDeleteCourse = async () => {
    if (!targetSession || !onDeleteSession) return
    if (isDefaultClassroom) {
      setError(t('assistantLibPage.settingsDeleteDefaultBlocked'))
      setConfirmDelete(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onDeleteSession(targetSession.id)
      setConfirmDelete(false)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('assistantLibPage.settingsDeleteCourseFailed'))
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    if (!targetSession || !draft) return
    const courseName = isDefaultClassroom
      ? t('assistantLibPage.defaultCourse')
      : draft.courseName.trim()
    if (!courseName) {
      setError(t('assistantLibPage.courseNameRequired'))
      return
    }

    const preset = getAssistantLibPreset(draft.presetId)
    const meta = parseAssistantLibSessionMeta(targetSession.metadata)
    setBusy(true)
    setError(null)
    try {
      let kbIds = draft.textbookSource === 'knowledge' && draft.kbId ? [draft.kbId] : undefined
      if (draft.textbookSource === 'local' && draft.filePaths.length > 0) {
        const created = await createLocalTextbookKnowledgeBase({
          workspaceId,
          name: courseName,
          defaultLocalFolderPath,
          filePaths: draft.filePaths,
        })
        if (created.warning) onStatusMessage?.(created.warning)
        kbIds = [created.kb.id]
        await onKnowledgeBasesChanged?.()
      } else if (draft.textbookSource === 'local' && draft.filePaths.length === 0 && !draft.kbId) {
        // Keep existing binding when user didn't pick new files.
        kbIds = meta?.kbIds?.length ? meta.kbIds : undefined
      }

      const result = await window.api.invoke(IpcChannel.SessionUpdate, {
        id: targetSession.id,
        title: courseName,
        metadata: assistantLibSessionMetadataPatch(targetSession.metadata, {
          presetId: draft.presetId,
          roleplayId: preset?.roleplayId ?? meta?.roleplayId,
          learningLabel: meta?.learningLabel ?? '学习',
          teachingMode: preset?.teachingMode ?? meta?.teachingMode ?? 'socratic',
          refereeEnabled: draft.refereeEnabled,
          kbIds,
          courseName,
          isDefaultClassroom: isDefaultClassroom || undefined,
          isGuideClassroom: isGuideClassroom || undefined,
          textbookLocalPath: meta?.textbookLocalPath,
          customSystemPrompt:
            draft.customSystemPrompt.trim() &&
            draft.customSystemPrompt.trim() !== (preset?.systemPrompt.trim() ?? '')
              ? draft.customSystemPrompt
              : undefined,
          lessonPlan: draft.lessonPlan,
          autoSpeak: draft.autoSpeak,
          ttsEngine: draft.ttsEngine,
          ttsVoice:
            draft.ttsEngine === 'edge' ? resolveCuratedEdgeTtsVoice(draft.ttsVoice) : undefined,
        }),
      })
      if (!result.ok) {
        throw new Error(result.error.message || t('assistantLibPage.settingsSaveFailed'))
      }
      await onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

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
                          onChange={(event) => {
                            const presetId = event.target.value as AssistantLibPresetId
                            const nextPreset = getAssistantLibPreset(presetId)
                            const previousPreset = getAssistantLibPreset(draft.presetId)
                            const usingDefaultLesson =
                              !draft.customSystemPrompt.trim() ||
                              draft.customSystemPrompt.trim() ===
                                (previousPreset?.systemPrompt.trim() ?? '')
                            updateDraft({
                              presetId,
                              refereeEnabled: nextPreset?.refereeEnabled ?? draft.refereeEnabled,
                              ...(usingDefaultLesson
                                ? { customSystemPrompt: nextPreset?.systemPrompt ?? '' }
                                : {}),
                            })
                          }}
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
                          <span>
                            {syllabus.generation === 'generating'
                              ? syllabus.chapters.length === 0
                                ? t('assistantLibPage.syllabusGenerating')
                                : t('assistantLibPage.syllabusProgress', {
                                    current: Math.max(
                                      1,
                                      syllabus.chapters.findIndex(
                                        (item) => item.status === 'generating',
                                      ) + 1,
                                    ),
                                    total: syllabus.chapters.length,
                                  })
                              : syllabus.generation === 'error'
                                ? syllabus.generationError || t('assistantLibPage.syllabusFailed')
                                : t('assistantLibPage.syllabusReady', {
                                    passed: syllabus.chapters.filter(
                                      (item) => item.status === 'passed',
                                    ).length,
                                    total: syllabus.chapters.length,
                                    hours: syllabus.totalHours ?? 0,
                                  })}
                          </span>
                        </div>
                      ) : null
                    }
                    onEditingChange={setEditingDoc}
                    onChange={(value) => updateDraft({ lessonPlan: value })}
                  />
                ) : null}

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
                {activeTab !== 'danger' ? (
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
