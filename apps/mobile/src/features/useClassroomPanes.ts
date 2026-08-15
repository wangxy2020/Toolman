import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getAssistantLibPreset,
  type AssistantLibPresetId,
} from '@toolman/shared'
import { saveModulePrefs } from '../settings/prefs'
import { useMobileApp, type ChatSession } from '../state/MobileAppContext'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import { ClassroomCreateCourseModal } from './ClassroomCreateCourseModal'
import { ClassroomSettingsModal } from './ClassroomSettingsModal'
import {
  classroomSidebarEntries,
  resolveClassroomLearningChapterId,
  resolveClassroomSettingsCourse,
  resolveClassroomSidebarFocus,
} from './classroomSidebar'

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createCourseAndSession(input: {
  courseName: string
  presetId: AssistantLibPresetId
}): { course: MobileClassroomCourse; session: ChatSession } {
  const preset = getAssistantLibPreset(input.presetId)
  const id = newId('course')
  const now = Date.now()
  return {
    course: {
      id,
      title: input.courseName,
      updatedAt: now,
      courseName: input.courseName,
      presetId: input.presetId,
      teachingMode: preset?.teachingMode ?? 'socratic',
      refereeEnabled: preset?.refereeEnabled ?? true,
      customSystemPrompt: preset?.systemPrompt ?? '',
      lessonPlan: '',
      syllabus: null,
      studyRecords: [],
      socraticState: null,
      isGuideClassroom: false,
      isDefaultClassroom: false,
    },
    session: {
      id,
      title: input.courseName,
      updatedAt: now,
      messages: [],
      agentScope: 'classroom',
    },
  }
}

type ClassroomUiValue = {
  openCreateCourse: () => void
  openCourseSettings: (courseId?: string) => void
  openRecords: () => void
  closeRecords: () => void
  recordsOpen: boolean
}

const ClassroomUiContext = createContext<ClassroomUiValue | null>(null)

export function useOptionalClassroomUi(): ClassroomUiValue | null {
  return useContext(ClassroomUiContext)
}

export function ClassroomUiProvider({ children }: { children: ReactNode }) {
  const {
    activeSessionId,
    setActiveSessionId,
    upsertSession,
    renameSession,
    removeSession,
    classroomCourses,
    setClassroomCourses,
    knowledgeMeta,
    modulePrefs,
    setModulePrefs,
    desktopHostsOnline,
  } = useMobileApp()
  const [createOpen, setCreateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCourseId, setSettingsCourseId] = useState<string | null>(null)
  const [recordsOpen, setRecordsOpen] = useState(false)

  const settingsCourse = resolveClassroomSettingsCourse(
    classroomCourses,
    settingsCourseId,
    activeSessionId,
  )

  const knowledgeNames = useMemo(() => {
    const ids = new Set(settingsCourse?.kbIds ?? [])
    if (ids.size === 0) return []
    return knowledgeMeta.filter((item) => ids.has(item.id)).map((item) => item.name)
  }, [knowledgeMeta, settingsCourse?.kbIds])

  const openCreateCourse = useCallback(() => setCreateOpen(true), [])
  const openRecords = useCallback(() => setRecordsOpen(true), [])
  const closeRecords = useCallback(() => setRecordsOpen(false), [])
  const openCourseSettings = useCallback((courseId?: string) => {
    const preferred = courseId ?? activeSessionId
    const match = resolveClassroomSettingsCourse(classroomCourses, preferred, activeSessionId)
    setSettingsCourseId(match?.id ?? preferred ?? null)
    setSettingsOpen(true)
  }, [activeSessionId, classroomCourses])

  const handleCreate = (input: { courseName: string; presetId: AssistantLibPresetId }) => {
    const { course, session } = createCourseAndSession(input)
    setClassroomCourses([course, ...classroomCourses])
    upsertSession(session)
    setActiveSessionId(course.id)
    setCreateOpen(false)
  }

  const handleSave = (next: MobileClassroomCourse) => {
    setClassroomCourses(
      classroomCourses.map((course) => (course.id === next.id ? next : course)),
    )
    renameSession(next.id, next.courseName || next.title)
    setSettingsOpen(false)
  }

  const handleDelete = (courseId: string) => {
    setClassroomCourses(classroomCourses.filter((course) => course.id !== courseId))
    removeSession(courseId)
    setSettingsOpen(false)
  }

  const handleSyncEnabled = (enabled: boolean) => {
    const next = {
      ...modulePrefs,
      classroom: { ...modulePrefs.classroom, syncEnabled: enabled },
    }
    setModulePrefs(next)
    void saveModulePrefs(next)
  }

  const value = useMemo(
    () => ({
      openCreateCourse,
      openCourseSettings,
      openRecords,
      closeRecords,
      recordsOpen,
    }),
    [closeRecords, openCreateCourse, openCourseSettings, openRecords, recordsOpen],
  )

  return createElement(
    ClassroomUiContext.Provider,
    { value },
    children,
    createElement(ClassroomCreateCourseModal, {
      visible: createOpen,
      onClose: () => setCreateOpen(false),
      onCreate: handleCreate,
    }),
    createElement(ClassroomSettingsModal, {
      visible: settingsOpen,
      course: settingsCourse,
      knowledgeNames,
      classroomSyncEnabled: modulePrefs.classroom.syncEnabled,
      desktopHostsOnline,
      onClassroomSyncEnabledChange: handleSyncEnabled,
      onClose: () => setSettingsOpen(false),
      onSave: handleSave,
      onDelete: handleDelete,
    }),
  )
}

export function useClassroomLeftPane() {
  const {
    activeSessionId,
    setActiveSessionId,
    setLeftOpen,
    classroomCourses,
  } = useMobileApp()
  const classroomUi = useOptionalClassroomUi()
  const entries = useMemo(
    () => classroomSidebarEntries(classroomCourses),
    [classroomCourses],
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [chapterByCourse, setChapterByCourse] = useState<Record<string, string>>({})
  const seededFocusRef = useRef(false)

  useEffect(() => {
    if (seededFocusRef.current || entries.length === 0) return
    const focus = resolveClassroomSidebarFocus(classroomCourses, activeSessionId)
    if (!focus) return
    seededFocusRef.current = true
    setExpanded(new Set([focus.courseId]))
    if (focus.chapterId) {
      setChapterByCourse({ [focus.courseId]: focus.chapterId })
    }
    if (focus.courseId !== activeSessionId) {
      setActiveSessionId(focus.courseId)
    }
  }, [activeSessionId, classroomCourses, entries.length, setActiveSessionId])

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectCourse = (id: string) => {
    setChapterByCourse((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setActiveSessionId(id)
    setExpanded((prev) => new Set(prev).add(id))
    classroomUi?.closeRecords()
    setLeftOpen(false)
  }

  const selectChapter = (courseId: string, chapterId: string, locked: boolean) => {
    if (locked) return
    setChapterByCourse((prev) => ({ ...prev, [courseId]: chapterId }))
    setActiveSessionId(courseId)
    setLeftOpen(false)
  }

  const selectedChapterId = (courseId: string, course: (typeof entries)[number]['course']) =>
    chapterByCourse[courseId] ?? resolveClassroomLearningChapterId(course)

  return {
    classroomUi,
    entries,
    expanded,
    activeSessionId,
    toggleExpanded,
    selectCourse,
    selectChapter,
    selectedChapterId,
  }
}
