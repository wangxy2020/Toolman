import { useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  getAssistantLibPreset,
  isAssistantLibDefaultClassroomSession,
  isAssistantLibGuideCourseSession,
  listSelectableAssistantLibPresets,
  parseAssistantLibSessionMeta,
  parseCourseSyllabus,
  type AssistantLibPresetId,
  type KnowledgeBase,
  type Provider,
  type Session,
} from '@toolman/shared'
import { useI18n } from '../../../i18n/useI18n'
import { safeInvoke } from '../../../lib/ipc-client'
import { buildModelOptions, formatModelDisplayLabel } from '../../chat/model-utils'
import { resolveTextbookKbDisplayPath } from '../AssistantLibLocalKbPickerModal'
import { createLocalTextbookKnowledgeBase } from '../create-textbook-kb'
import {
  applyPresetChangeToDraft,
  buildClassroomSettingsMetadata,
  draftFromSession,
  formatSyllabusStatusText,
  hasTextbookSelection,
  resolveAssistantLibCourseLabel,
  resolveInitialSaveKbIds,
  resolveLessonPlanMarkdown,
  resolveSettingsPresets,
  resolveSettingsTargetSession,
  resolveTextbookPathDisplay,
  type AssistantLibClassroomDraft,
  type AssistantLibSettingsTab,
} from '../assistant-lib-settings-utils'

export type UseAssistantLibSettingsDialogProps = {
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
  providers?: Provider[]
}

export function useAssistantLibSettingsDialog({
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
  providers = [],
}: UseAssistantLibSettingsDialogProps) {
  const { t } = useI18n()
  const selectablePresets = useMemo(() => listSelectableAssistantLibPresets(), [])

  const targetSession = useMemo(
    () => resolveSettingsTargetSession(sessions, activeSessionId),
    [activeSessionId, sessions],
  )

  const [activeTab, setActiveTab] = useState<AssistantLibSettingsTab>('basic')
  const [draft, setDraft] = useState<AssistantLibClassroomDraft | null>(null)
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
    const markdown = resolveLessonPlanMarkdown(targetSession)
    setDraft((prev) => {
      if (!prev || prev.lessonPlan === markdown) return prev
      return { ...prev, lessonPlan: markdown }
    })
  }, [editingDoc, targetSession])

  const selectTab = (tab: AssistantLibSettingsTab) => {
    setActiveTab(tab)
    setEditingDoc(false)
  }

  const syllabus = targetSession
    ? parseCourseSyllabus(parseAssistantLibSessionMeta(targetSession.metadata)?.syllabus)
    : null
  const syllabusGenerating = syllabus?.generation === 'generating'
  const syllabusStatusText = syllabus ? formatSyllabusStatusText(syllabus, t) : null
  const modelOptions = useMemo(() => {
    const options = buildModelOptions(providers)
    const selected = draft?.modelId?.trim()
    if (selected && !options.some((item) => item.modelId === selected)) {
      return [
        ...options,
        { modelId: selected, label: formatModelDisplayLabel(selected, providers) || selected },
      ]
    }
    return options
  }, [draft?.modelId, providers])
  const syllabusModelId = draft?.modelId?.trim() || defaultModelId || null

  const handleGenerateSyllabus = () => {
    if (!targetSession) return
    if (!syllabusModelId) {
      setError(t('assistantLibPage.syllabusNeedModel'))
      return
    }
    setError(null)
    void safeInvoke(IpcChannel.AssistantLibSyllabusGenerate, {
      workspaceId,
      sessionId: targetSession.id,
      modelId: syllabusModelId,
    }).then((result) => {
      if (!result.ok) setError(result.error.message)
    })
  }

  const courseLabel = targetSession
    ? resolveAssistantLibCourseLabel(
        targetSession,
        t('assistantLibPage.defaultCourse'),
        t('assistantLibPage.guideCourse'),
      )
    : t('assistantLibPage.defaultCourse')
  const presets = useMemo(
    () => resolveSettingsPresets(draft, selectablePresets),
    [draft, selectablePresets],
  )
  const selectedPreset = draft
    ? (presets.find((item) => item.id === draft.presetId) ??
      getAssistantLibPreset(draft.presetId) ??
      presets[0])
    : null

  const pathDisplay = useMemo(() => (draft ? resolveTextbookPathDisplay(draft) : ''), [draft])
  const textbookSelected = Boolean(draft && hasTextbookSelection(draft))

  const updateDraft = (patch: Partial<AssistantLibClassroomDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setError(null)
  }

  const handlePresetChange = (presetId: AssistantLibPresetId) => {
    if (!draft) return
    updateDraft(applyPresetChangeToDraft(draft, presetId))
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

    const meta = parseAssistantLibSessionMeta(targetSession.metadata)
    setBusy(true)
    setError(null)
    try {
      let kbIds = resolveInitialSaveKbIds(draft, meta?.kbIds)
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
      }

      const result = await window.api.invoke(IpcChannel.SessionUpdate, {
        id: targetSession.id,
        title: courseName,
        metadata: buildClassroomSettingsMetadata(targetSession, draft, {
          courseName,
          kbIds,
          isDefaultClassroom,
          isGuideClassroom,
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

  return {
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
    isGuideClassroom,
    courseLabel,
    presets,
    selectedPreset,
    pathDisplay,
    hasTextbookSelection: textbookSelected,
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
    modelOptions,
    syllabusModelId,
  }
}
