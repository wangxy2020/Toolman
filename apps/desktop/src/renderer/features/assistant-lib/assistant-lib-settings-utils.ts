import {
  assistantLibSessionMetadataPatch,
  formatSyllabusMarkdown,
  getAssistantLibPreset,
  isAssistantLibDefaultClassroomSession,
  isAssistantLibGuideCourseSession,
  parseAssistantLibSessionMeta,
  type AssistantLibPresetDef,
  type AssistantLibPresetId,
  type CourseSyllabus,
  type KnowledgeBase,
  type Session,
  type VoiceTtsEngine,
} from '@toolman/shared'
import type { TranslateFn } from '../../i18n/useI18n'
import { resolveCuratedEdgeTtsVoice } from '../voice/tts-provider-factory'
import {
  formatAssistantLibSelectedFiles,
  type AssistantLibTextbookSource,
} from './assistant-lib-form-utils'
import { resolveTextbookKbDisplayPath } from './AssistantLibLocalKbPickerModal'

export type AssistantLibSettingsTab = 'basic' | 'teaching' | 'lesson' | 'sync' | 'danger'

export type AssistantLibClassroomDraft = {
  courseName: string
  presetId: AssistantLibPresetId
  refereeEnabled: boolean
  textbookSource: AssistantLibTextbookSource
  kbId: string
  kbPath: string
  filePaths: string[]
  customSystemPrompt: string
  lessonPlan: string
  autoSpeak: boolean
  ttsEngine: VoiceTtsEngine
  ttsVoice: string
  /** Empty = follow workspace default model. */
  modelId: string
}

export function resolveAssistantLibCourseLabel(
  session: Session,
  defaultLabel: string,
  guideLabel: string,
): string {
  if (isAssistantLibDefaultClassroomSession(session.metadata)) return defaultLabel
  if (isAssistantLibGuideCourseSession(session.metadata)) return guideLabel
  const meta = parseAssistantLibSessionMeta(session.metadata)
  return meta?.courseName?.trim() || session.title || defaultLabel
}

export function resolveSettingsTargetSession(
  sessions: Session[],
  activeSessionId: string | null,
): Session | null {
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
}

export function draftFromSession(
  session: Session,
  knowledgeBases: KnowledgeBase[],
  defaultLocalFolderPath: string | null,
): AssistantLibClassroomDraft {
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
    modelId: meta?.modelId?.trim() ?? '',
  }
}

export function resolveLessonPlanMarkdown(session: Session): string {
  const meta = parseAssistantLibSessionMeta(session.metadata)
  return (
    meta?.lessonPlan?.trim() ||
    (meta?.syllabus ? formatSyllabusMarkdown(meta.syllabus) : '')
  )
}

export function resolveSettingsPresets(
  draft: AssistantLibClassroomDraft | null,
  selectablePresets: AssistantLibPresetDef[],
): AssistantLibPresetDef[] {
  if (!draft) return selectablePresets
  if (selectablePresets.some((item) => item.id === draft.presetId)) return selectablePresets
  const current = getAssistantLibPreset(draft.presetId)
  return current ? [current, ...selectablePresets] : selectablePresets
}

export function resolveTextbookPathDisplay(draft: AssistantLibClassroomDraft): string {
  if (draft.textbookSource === 'local') return formatAssistantLibSelectedFiles(draft.filePaths)
  return draft.kbPath
}

export function hasTextbookSelection(draft: AssistantLibClassroomDraft): boolean {
  return draft.textbookSource === 'knowledge'
    ? Boolean(draft.kbId || draft.kbPath)
    : draft.filePaths.length > 0
}

export function applyPresetChangeToDraft(
  draft: AssistantLibClassroomDraft,
  presetId: AssistantLibPresetId,
): Partial<AssistantLibClassroomDraft> {
  const nextPreset = getAssistantLibPreset(presetId)
  const previousPreset = getAssistantLibPreset(draft.presetId)
  const usingDefaultLesson =
    !draft.customSystemPrompt.trim() ||
    draft.customSystemPrompt.trim() === (previousPreset?.systemPrompt.trim() ?? '')
  return {
    presetId,
    refereeEnabled: nextPreset?.refereeEnabled ?? draft.refereeEnabled,
    ...(usingDefaultLesson ? { customSystemPrompt: nextPreset?.systemPrompt ?? '' } : {}),
  }
}

export function resolveInitialSaveKbIds(
  draft: AssistantLibClassroomDraft,
  existingKbIds: string[] | undefined,
): string[] | undefined {
  if (draft.textbookSource === 'knowledge' && draft.kbId) return [draft.kbId]
  if (draft.textbookSource === 'local' && draft.filePaths.length === 0 && !draft.kbId) {
    return existingKbIds?.length ? existingKbIds : undefined
  }
  return undefined
}

export function buildClassroomSettingsMetadata(
  session: Session,
  draft: AssistantLibClassroomDraft,
  options: {
    courseName: string
    kbIds: string[] | undefined
    isDefaultClassroom: boolean
    isGuideClassroom: boolean
  },
) {
  const preset = getAssistantLibPreset(draft.presetId)
  const meta = parseAssistantLibSessionMeta(session.metadata)
  return assistantLibSessionMetadataPatch(session.metadata, {
    presetId: draft.presetId,
    roleplayId: preset?.roleplayId ?? meta?.roleplayId,
    learningLabel: meta?.learningLabel ?? '学习',
    teachingMode: preset?.teachingMode ?? meta?.teachingMode ?? 'socratic',
    refereeEnabled: draft.refereeEnabled,
    kbIds: options.kbIds,
    courseName: options.courseName,
    isDefaultClassroom: options.isDefaultClassroom || undefined,
    isGuideClassroom: options.isGuideClassroom || undefined,
    textbookLocalPath: meta?.textbookLocalPath,
    customSystemPrompt:
      draft.customSystemPrompt.trim() &&
      draft.customSystemPrompt.trim() !== (preset?.systemPrompt.trim() ?? '')
        ? draft.customSystemPrompt
        : undefined,
    lessonPlan: draft.lessonPlan,
    autoSpeak: draft.autoSpeak,
    ttsEngine: draft.ttsEngine,
    ttsVoice: draft.ttsEngine === 'edge' ? resolveCuratedEdgeTtsVoice(draft.ttsVoice) : undefined,
    modelId: draft.modelId.trim(),
  })
}

export function formatSyllabusStatusText(syllabus: CourseSyllabus, t: TranslateFn): string {
  if (syllabus.generation === 'generating') {
    if (syllabus.chapters.length === 0) return t('assistantLibPage.syllabusGenerating')
    return t('assistantLibPage.syllabusProgress', {
      current: Math.max(
        1,
        syllabus.chapters.findIndex((item) => item.status === 'generating') + 1,
      ),
      total: syllabus.chapters.length,
    })
  }
  if (syllabus.generation === 'error') {
    return syllabus.generationError || t('assistantLibPage.syllabusFailed')
  }
  return t('assistantLibPage.syllabusReady', {
    passed: syllabus.chapters.filter((item) => item.status === 'passed').length,
    total: syllabus.chapters.length,
    hours: syllabus.totalHours ?? 0,
  })
}
