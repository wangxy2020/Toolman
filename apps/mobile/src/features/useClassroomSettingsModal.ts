import { useEffect, useMemo, useState } from 'react'
import {
  formatSyllabusMarkdown,
  getAssistantLibPreset,
  listSelectableAssistantLibPresets,
  type AssistantLibPresetId,
} from '@toolman/shared'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import {
  DEFAULT_EDGE_TTS_VOICE,
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '../voice'
import { classroomCourseLabel } from './classroomSidebar'

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
}

export type ClassroomSettingsModalProps = {
  visible: boolean
  course: MobileClassroomCourse | null
  knowledgeNames: string[]
  classroomSyncEnabled: boolean
  desktopHostsOnline: number
  onClassroomSyncEnabledChange: (enabled: boolean) => void
  onClose: () => void
  onSave: (course: MobileClassroomCourse) => void
  onDelete: (courseId: string) => void
}

export function draftFromCourse(course: MobileClassroomCourse): ClassroomSettingsDraft {
  const presetId = (course.presetId as AssistantLibPresetId) || 'socratic-tutor'
  const preset = getAssistantLibPreset(presetId)
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
    },
  }
}

export function classroomDeleteError(isDefault: boolean, isGuide: boolean): string | null {
  if (isDefault) return '默认课程不可删除。'
  if (isGuide) return 'Toolman使用说明课程不可删除。'
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

export function useClassroomSettingsModal(props: ClassroomSettingsModalProps) {
  const { visible, course, onSave, onDelete } = props
  const presets = useMemo(
    () => listSelectableAssistantLibPresets().filter((preset) => preset.id !== 'toolman-guide'),
    [],
  )
  const [activeTab, setActiveTab] = useState<ClassroomSettingsTab>('basic')
  const [draft, setDraft] = useState<ClassroomSettingsDraft | null>(null)
  const [editingDoc, setEditingDoc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!visible) return
    setActiveTab('basic')
    setDraft(course ? draftFromCourse(course) : null)
    setEditingDoc(false)
    setError(null)
    setConfirmDelete(false)
  }, [visible, course?.id])

  const courseLabel = course ? classroomCourseLabel(course) : '课程'
  const isGuide = course?.isGuideClassroom === true
  const isDefault = course?.isDefaultClassroom === true
  const shownPresets = presets
  const selectedPreset = draft
    ? (shownPresets.find((item) => item.id === draft.presetId) ?? null)
    : null

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
    updateDraft,
    handleSave,
    handleDelete,
    docValue,
    setDocValue,
  }
}
