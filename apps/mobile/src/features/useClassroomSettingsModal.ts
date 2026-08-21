import { useEffect, useMemo, useState } from 'react'
import {
  formatSyllabusMarkdown,
  getAssistantLibPreset,
  listSelectableAssistantLibPresets,
  type AssistantLibPresetId,
  type KnowledgeMetaItem,
} from '@toolman/shared'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import {
  DEFAULT_EDGE_TTS_VOICE,
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '../voice'
import { classroomCourseLabel } from './classroomSidebar'
import { getProviderPreset, MOBILE_PROVIDER_PRESETS } from '../settings/provider-presets'
import { readProviderCredential } from '../storage/providerCredentials'
import { useMobileApp, type ModelConfig } from '../state/MobileAppContext'

export type ClassroomSettingsTab = 'basic' | 'teaching' | 'lesson' | 'sync' | 'danger'

export const CLASSROOM_SETTINGS_TABS: Array<{ id: ClassroomSettingsTab; label: string }> = [
  { id: 'basic', label: '基础设置' },
  { id: 'teaching', label: '教学模式' },
  { id: 'lesson', label: '教学大纲' },
  { id: 'sync', label: '同步设置' },
  { id: 'danger', label: '危险操作' },
]

export type ClassroomSettingsDraft = {
  courseName: string
  presetId: AssistantLibPresetId
  refereeEnabled: boolean
  customSystemPrompt: string
  lessonPlan: string
  autoSpeak: boolean
  ttsEngine: VoiceTtsEngine
  ttsVoice: string
  kbIds: string[]
  kbLabel: string
  modelId: string
}

export type ClassroomSettingsModalProps = {
  visible: boolean
  course: MobileClassroomCourse | null
  knowledgeMeta: KnowledgeMetaItem[]
  knowledgeNames: string[]
  classroomSyncEnabled: boolean
  desktopHostsOnline: number
  onClassroomSyncEnabledChange: (enabled: boolean) => void
  onClose: () => void
  onSave: (course: MobileClassroomCourse) => void
  onDelete: (courseId: string) => void
  onGenerateSyllabus: (course: MobileClassroomCourse) => void | Promise<void>
  onRememberKbLabels: (ids: string[], labels: string[]) => void
}

export function draftFromCourse(
  course: MobileClassroomCourse,
  knowledgeNames: string[],
): ClassroomSettingsDraft {
  const presetId = (course.presetId as AssistantLibPresetId) || 'socratic-tutor'
  const preset = getAssistantLibPreset(presetId)
  const kbIds = course.kbIds ?? []
  return {
    courseName: course.courseName || course.title,
    presetId,
    refereeEnabled: course.refereeEnabled,
    customSystemPrompt: course.customSystemPrompt.trim() || preset?.systemPrompt || '',
    lessonPlan:
      course.lessonPlan.trim() ||
      (course.syllabus ? formatSyllabusMarkdown(course.syllabus) : ''),
    autoSpeak: course.autoSpeak !== false,
    ttsEngine: course.ttsEngine === 'web-speech' ? 'web-speech' : 'edge',
    ttsVoice: resolveCuratedEdgeTtsVoice(course.ttsVoice || DEFAULT_EDGE_TTS_VOICE),
    kbIds,
    kbLabel: course.kbLabels?.[0] || knowledgeNames.join('、'),
    modelId: course.modelId?.trim() ?? '',
  }
}

export function applyClassroomSettingsDraft(
  course: MobileClassroomCourse,
  draft: ClassroomSettingsDraft,
  isDefault: boolean,
): { course: MobileClassroomCourse } | { error: string } {
  const courseName = isDefault ? '默认课程' : draft.courseName.trim()
  if (!courseName) return { error: '请填写课程名称' }
  const preset = getAssistantLibPreset(draft.presetId)
  return {
    course: {
      ...course,
      title: courseName,
      courseName,
      updatedAt: Date.now(),
      presetId: draft.presetId,
      teachingMode: preset?.teachingMode ?? course.teachingMode,
      refereeEnabled: draft.refereeEnabled,
      customSystemPrompt: draft.customSystemPrompt,
      lessonPlan: draft.lessonPlan,
      autoSpeak: draft.autoSpeak,
      ttsEngine: draft.ttsEngine,
      ttsVoice:
        draft.ttsEngine === 'edge'
          ? resolveCuratedEdgeTtsVoice(draft.ttsVoice)
          : draft.ttsVoice,
      kbIds: draft.kbIds,
      kbLabels: draft.kbIds.length > 0 && draft.kbLabel.trim() ? [draft.kbLabel.trim()] : undefined,
      modelId: draft.modelId.trim() || undefined,
    },
  }
}

export function classroomDeleteError(isDefault: boolean, _isGuide = false): string | null {
  if (isDefault) return '默认课程不可删除。'
  return null
}

export function classroomPresetPatch(
  draft: ClassroomSettingsDraft,
  nextId: AssistantLibPresetId,
): Partial<ClassroomSettingsDraft> {
  const next = getAssistantLibPreset(nextId)
  const previous = getAssistantLibPreset(draft.presetId)
  const usingDefault =
    !draft.customSystemPrompt.trim() ||
    draft.customSystemPrompt.trim() === (previous?.systemPrompt.trim() ?? '')
  return {
    presetId: nextId,
    refereeEnabled: next?.refereeEnabled ?? draft.refereeEnabled,
    ...(usingDefault ? { customSystemPrompt: next?.systemPrompt ?? '' } : {}),
  }
}

export function mobileDefaultCourseModelOptionLabel(config: ModelConfig): string {
  const model = config.model.trim()
  if (!model) return '使用默认模型'
  const preset = MOBILE_PROVIDER_PRESETS.find((item) => item.id === config.providerId)
  const providerName = preset?.name || config.providerId
  return `使用默认模型（${providerName} / ${model}）`
}

export function formatMobileCourseModelLabel(providerId: string, model: string): string {
  const preset = MOBILE_PROVIDER_PRESETS.find((item) => item.id === providerId)
  return preset ? `${preset.name} / ${model}` : `${providerId} / ${model}`
}

export function listMobileCourseModelOptions(
  config: ModelConfig,
  selectedModelId?: string,
): Array<{ modelId: string; label: string }> {
  const seen = new Set<string>()
  const options: Array<{ modelId: string; label: string }> = []
  const add = (providerId: string, model: string) => {
    const id = `${providerId}:${model}`
    if (!providerId.trim() || !model.trim() || seen.has(id)) return
    seen.add(id)
    options.push({
      modelId: id,
      label: formatMobileCourseModelLabel(providerId, model),
    })
  }
  add(config.providerId, config.model.trim())
  for (const [id, cred] of Object.entries(config.credentialsByProvider ?? {})) {
    if (cred.model?.trim()) add(id, cred.model.trim())
  }
  const configuredProviderIds = new Set<string>()
  if (config.providerId.trim()) configuredProviderIds.add(config.providerId)
  for (const [id, cred] of Object.entries(config.credentialsByProvider ?? {})) {
    if (cred.apiKey?.trim() || cred.model?.trim()) configuredProviderIds.add(id)
  }
  for (const providerId of configuredProviderIds) {
    const preset = getProviderPreset(providerId)
    for (const model of [preset.defaultModel, ...preset.suggestedModels]) {
      if (model.trim()) add(providerId, model.trim())
    }
  }
  const selected = selectedModelId?.trim()
  if (selected && !seen.has(selected)) {
    const sep = selected.indexOf(':')
    if (sep > 0) add(selected.slice(0, sep), selected.slice(sep + 1))
    else options.push({ modelId: selected, label: selected })
  }
  return options
}

export function resolveSelectedCourseModelLabel(
  modelId: string,
  options: Array<{ modelId: string; label: string }>,
  defaultLabel: string,
): string {
  const selected = modelId.trim()
  if (!selected) return defaultLabel.replace(/^使用默认模型/, '跟随默认').trim()
  const match =
    options.find((item) => item.modelId === selected) ??
    options.find((item) => item.modelId.endsWith(`:${selected}`))
  return match?.label ?? selected
}

export function resolveCourseSendModelConfig(
  base: ModelConfig,
  courseModelId?: string,
): ModelConfig {
  const modelId = courseModelId?.trim()
  if (!modelId) return base
  const sep = modelId.indexOf(':')
  const providerId = sep === -1 ? base.providerId : modelId.slice(0, sep)
  const model = sep === -1 ? modelId : modelId.slice(sep + 1)
  if (!model) return base
  const stored = readProviderCredential(base.credentialsByProvider, providerId)
  const knownPreset = MOBILE_PROVIDER_PRESETS.some((item) => item.id === providerId)
  if (stored || knownPreset) {
    const preset = getProviderPreset(providerId)
    return {
      ...base,
      providerId,
      model,
      apiKey: stored?.apiKey || base.apiKey,
      baseUrl:
        stored?.baseUrl ||
        (providerId === base.providerId ? base.baseUrl : preset.defaultBaseUrl),
    }
  }
  return { ...base, model }
}

export function useClassroomSettingsModal(props: ClassroomSettingsModalProps) {
  const { visible, course, knowledgeNames, onSave, onDelete, onGenerateSyllabus } = props
  const { modelConfig } = useMobileApp()
  const presets = useMemo(
    () => listSelectableAssistantLibPresets().filter((preset) => preset.id !== 'toolman-guide'),
    [],
  )
  const [activeTab, setActiveTab] = useState<ClassroomSettingsTab>('basic')
  const [draft, setDraft] = useState<ClassroomSettingsDraft | null>(null)
  const [editingDoc, setEditingDoc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [kbPickerOpen, setKbPickerOpen] = useState(false)
  const [generatingSyllabus, setGeneratingSyllabus] = useState(false)

  useEffect(() => {
    if (!visible) return
    setActiveTab('basic')
    setDraft(course ? draftFromCourse(course, knowledgeNames) : null)
    setEditingDoc(false)
    setError(null)
    setConfirmDelete(false)
    setKbPickerOpen(false)
    setGeneratingSyllabus(false)
  }, [visible, course?.id])

  useEffect(() => {
    if (!visible || !draft || draft.kbLabel || knowledgeNames.length === 0) return
    setDraft((prev) => (prev ? { ...prev, kbLabel: knowledgeNames.join('、') } : prev))
  }, [knowledgeNames, visible])

  const courseLabel = course ? classroomCourseLabel(course) : '课程'
  const isGuide = course?.isGuideClassroom === true
  const isDefault = course?.isDefaultClassroom === true
  const shownPresets = presets
  const selectedPreset = draft
    ? (shownPresets.find((item) => item.id === draft.presetId) ?? null)
    : null
  const modelOptions = useMemo(
    () => listMobileCourseModelOptions(modelConfig, draft?.modelId),
    [draft?.modelId, modelConfig],
  )
  const defaultModelOptionLabel = useMemo(
    () => mobileDefaultCourseModelOptionLabel(modelConfig),
    [modelConfig],
  )
  const syllabusGenerating = course?.syllabus?.generation === 'generating' || generatingSyllabus

  const updateDraft = (patch: Partial<ClassroomSettingsDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setError(null)
  }

  const handleSave = () => {
    if (!course || !draft) return
    const result = applyClassroomSettingsDraft(course, draft, isDefault)
    if ('error' in result) {
      setError(result.error)
      setActiveTab('basic')
      return
    }
    onSave(result.course)
  }

  const handleDelete = () => {
    if (!course) return
    const blocked = classroomDeleteError(isDefault, isGuide)
    if (blocked) {
      setError(blocked)
      setConfirmDelete(false)
      return
    }
    onDelete(course.id)
  }

  const handleGenerateSyllabus = async () => {
    if (!course || !draft) return
    if (draft.kbIds.length === 0) {
      setError('请先绑定教材知识库后再生成大纲')
      setActiveTab('basic')
      return
    }
    const result = applyClassroomSettingsDraft(course, draft, isDefault)
    if ('error' in result) {
      setError(result.error)
      setActiveTab('basic')
      return
    }
    setGeneratingSyllabus(true)
    setError(null)
    try {
      await onGenerateSyllabus(result.course)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGeneratingSyllabus(false)
    }
  }

  const docValue = activeTab === 'teaching' ? (draft?.customSystemPrompt ?? '') : (draft?.lessonPlan ?? '')
  const setDocValue = (value: string) => {
    if (activeTab === 'teaching') updateDraft({ customSystemPrompt: value })
    else updateDraft({ lessonPlan: value })
  }

  const selectTab = (tab: ClassroomSettingsTab) => {
    setActiveTab(tab)
    setEditingDoc(false)
  }

  return {
    activeTab,
    selectTab,
    draft,
    editingDoc,
    setEditingDoc,
    error,
    confirmDelete,
    setConfirmDelete,
    courseLabel,
    isGuide,
    isDefault,
    shownPresets,
    selectedPreset,
    modelOptions,
    defaultModelOptionLabel,
    updateDraft,
    handleSave,
    handleDelete,
    handleGenerateSyllabus,
    docValue,
    setDocValue,
    kbPickerOpen,
    setKbPickerOpen,
    syllabusGenerating,
  }
}
