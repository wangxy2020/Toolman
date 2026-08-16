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
import { Alert } from 'react-native'
import { requestDesktopSyllabusGenerate } from '../host/invokeDesktop'
import { saveModulePrefs } from '../settings/prefs'
import { useMobileApp, type ChatSession } from '../state/MobileAppContext'
import { pushClassroomChanges } from '../sync/mobileSync'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import {
  ClassroomCreateCourseModal,
  type ClassroomCreateCourseInput,
} from './ClassroomCreateCourseModal'
import { ClassroomSettingsModal } from './ClassroomSettingsModal'
import {
  classroomSidebarEntries,
  resolveClassroomLearningChapterId,
  resolveClassroomSettingsCourse,
  resolveClassroomSidebarFocus,
} from './classroomSidebar'

function newCourseId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8
    return value.toString(16)
  })
}

function createCourseAndSession(input: {
  courseName: string
  presetId: AssistantLibPresetId
  kbIds: string[]
}): { course: MobileClassroomCourse; session: ChatSession } {
  const preset = getAssistantLibPreset(input.presetId)
  const id = newCourseId()
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
      kbIds: input.kbIds,
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

async function syncCourseThenGenerateSyllabus(
  course: MobileClassroomCourse,
  courses: MobileClassroomCourse[],
  options: { classroomSyncEnabled: boolean; syncCursor: string | null },
): Promise<string | null> {
  if (!options.classroomSyncEnabled) {
    return '请先在课程设置中开启「接收桌面端课程」同步，才能生成教学大纲'
  }
  try {
    await pushClassroomChanges(courses, options.syncCursor)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  try {
    const result = await requestDesktopSyllabusGenerate({ sessionId: course.id })
    return result.message ?? (result.started ? '已开始生成教学大纲' : '大纲正在生成中')
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
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
    syncCursor,
    runSync,
  } = useMobileApp()
  const [createOpen, setCreateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCourseId, setSettingsCourseId] = useState<string | null>(null)
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [kbLabelById, setKbLabelById] = useState<Record<string, string>>({})

  const settingsCourse = resolveClassroomSettingsCourse(
    classroomCourses,
    settingsCourseId,
    activeSessionId,
  )

  const knowledgeNames = useMemo(() => {
    const ids = settingsCourse?.kbIds ?? []
    if (ids.length === 0) return []
    return ids.map((id) => {
      const fromMeta = knowledgeMeta.find((item) => item.id === id)?.name
      return fromMeta ?? kbLabelById[id] ?? id
    })
  }, [kbLabelById, knowledgeMeta, settingsCourse?.kbIds])

  const openCreateCourse = useCallback(() => setCreateOpen(true), [])
  const openRecords = useCallback(() => setRecordsOpen(true), [])
  const closeRecords = useCallback(() => setRecordsOpen(false), [])
  const openCourseSettings = useCallback((courseId?: string) => {
    const preferred = courseId ?? activeSessionId
    const match = resolveClassroomSettingsCourse(classroomCourses, preferred, activeSessionId)
    setSettingsCourseId(match?.id ?? preferred ?? null)
    setSettingsOpen(true)
  }, [activeSessionId, classroomCourses])

  const rememberKbLabels = useCallback((ids: string[], labels: string[]) => {
    if (ids.length === 0) return
    setKbLabelById((prev) => {
      const next = { ...prev }
      ids.forEach((id, index) => {
        const label = labels[index]
        if (label) next[id] = label
      })
      return next
    })
  }, [])

  const handleCreate = async (input: ClassroomCreateCourseInput) => {
    const { course, session } = createCourseAndSession(input)
    if (input.kbIds.length > 0 && input.kbLabel) {
      rememberKbLabels(input.kbIds, [input.kbLabel])
    }
    const nextCourses = [course, ...classroomCourses]
    setClassroomCourses(nextCourses)
    upsertSession(session)
    setActiveSessionId(course.id)
    setCreateOpen(false)

    if (!input.generateSyllabus || input.kbIds.length === 0) return
    const message = await syncCourseThenGenerateSyllabus(course, nextCourses, {
      classroomSyncEnabled: modulePrefs.classroom.syncEnabled,
      syncCursor,
    })
    if (message) {
      Alert.alert('教学大纲', message)
      if (modulePrefs.classroom.syncEnabled) void runSync('manual')
    }
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

  const handleGenerateSyllabus = async (course: MobileClassroomCourse) => {
    const latest = classroomCourses.map((item) => (item.id === course.id ? course : item))
    if (!latest.some((item) => item.id === course.id)) {
      latest.unshift(course)
    }
    setClassroomCourses(latest)
    const message = await syncCourseThenGenerateSyllabus(course, latest, {
      classroomSyncEnabled: modulePrefs.classroom.syncEnabled,
      syncCursor,
    })
    if (message) Alert.alert('教学大纲', message)
    if (modulePrefs.classroom.syncEnabled) void runSync('manual')
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
      knowledgeMeta,
      onClose: () => setCreateOpen(false),
      onCreate: handleCreate,
    }),
    createElement(ClassroomSettingsModal, {
      visible: settingsOpen,
      course: settingsCourse,
      knowledgeMeta,
      knowledgeNames,
      classroomSyncEnabled: modulePrefs.classroom.syncEnabled,
      desktopHostsOnline,
      onClassroomSyncEnabledChange: handleSyncEnabled,
      onClose: () => setSettingsOpen(false),
      onSave: handleSave,
      onDelete: handleDelete,
      onGenerateSyllabus: handleGenerateSyllabus,
      onRememberKbLabels: rememberKbLabels,
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
