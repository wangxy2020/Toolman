import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import {
  getAssistantLibPreset,
  type AssistantLibPresetId,
} from '@toolman/shared'
import { saveModulePrefs } from '../settings/prefs'
import { useMobileApp, type ChatSession } from '../state/MobileAppContext'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import { colors } from '../theme'
import { AgentRightPane } from './AgentPanes'
import { ClassroomCreateCourseModal } from './ClassroomCreateCourseModal'
import { ClassroomRecordsPane } from './ClassroomRecordsPane'
import { ClassroomSettingsModal } from './ClassroomSettingsModal'
import {
  classroomSidebarEntries,
  resolveClassroomLearningChapterId,
  resolveClassroomSettingsCourse,
  resolveClassroomSidebarFocus,
} from './classroomSidebar'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    const preset = getAssistantLibPreset(input.presetId)
    const id = newId('course')
    const now = Date.now()
    const course: MobileClassroomCourse = {
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
    }
    const session: ChatSession = {
      id,
      title: input.courseName,
      updatedAt: now,
      messages: [],
      agentScope: 'classroom',
    }
    setClassroomCourses([course, ...classroomCourses])
    upsertSession(session)
    setActiveSessionId(id)
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

  return (
    <ClassroomUiContext.Provider value={value}>
      {children}
      <ClassroomCreateCourseModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <ClassroomSettingsModal
        visible={settingsOpen}
        course={settingsCourse}
        knowledgeNames={knowledgeNames}
        classroomSyncEnabled={modulePrefs.classroom.syncEnabled}
        desktopHostsOnline={desktopHostsOnline}
        onClassroomSyncEnabledChange={handleSyncEnabled}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </ClassroomUiContext.Provider>
  )
}

export function ClassroomLeftPane() {
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

  return (
    <SidebarShell>
      <SidebarAddButton
        label="添加课程"
        onPress={() => classroomUi?.openCreateCourse()}
      />
      <SidebarList>
        {entries.length === 0 ? (
          <Text style={sidebarStyles.empty}>暂无学习会话。点击添加课程开始。</Text>
        ) : (
          entries.map((entry) => {
            const isOpen = expanded.has(entry.id)
            const isActive = entry.id === activeSessionId
            const selectedChapterId =
              chapterByCourse[entry.id] ?? resolveClassroomLearningChapterId(entry.course)
            return (
              <View key={entry.id} style={styles.group}>
                <View style={[styles.courseRow, isActive ? styles.courseRowActive : null]}>
                  <Pressable
                    accessibilityLabel={isOpen ? '折叠' : '展开'}
                    onPress={() => toggleExpanded(entry.id)}
                    style={({ pressed }) => [
                      styles.expandHit,
                      pressed ? styles.expandHitPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.chevron, isOpen ? styles.chevronOpen : null]}
                      accessibilityElementsHidden
                    >
                      ›
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => selectCourse(entry.id)}
                    onLongPress={() => classroomUi?.openCourseSettings(entry.id)}
                    delayLongPress={400}
                    style={styles.courseNameHit}
                  >
                    <Text
                      style={[styles.courseName, isActive ? styles.courseNameActive : null]}
                      numberOfLines={1}
                    >
                      {entry.label}
                    </Text>
                  </Pressable>
                </View>
                {isOpen ? (
                  entry.chapters.length === 0 ? (
                    <Text style={styles.emptyChapters}>暂无目录</Text>
                  ) : (
                    entry.chapters.map((chapter) => {
                      const chapterActive = isActive && selectedChapterId === chapter.id
                      return (
                        <Pressable
                          key={chapter.id}
                          disabled={chapter.locked}
                          onPress={() => {
                            if (chapter.locked) return
                            setChapterByCourse((prev) => ({ ...prev, [entry.id]: chapter.id }))
                            setActiveSessionId(entry.id)
                            setLeftOpen(false)
                          }}
                          style={({ pressed }) => [
                            styles.chapterItem,
                            chapterActive ? styles.chapterItemActive : null,
                            chapter.locked ? styles.chapterItemLocked : null,
                            pressed && !chapterActive && !chapter.locked
                              ? styles.chapterItemPressed
                              : null,
                          ]}
                        >
                          <View style={styles.chapterIcon}>
                            <IconTopic
                              size={14}
                              color={chapterActive ? colors.text : colors.textSecondary}
                            />
                          </View>
                          <Text
                            style={[
                              styles.chapterLabel,
                              chapterActive ? styles.chapterLabelActive : null,
                              chapter.status === 'passed' ? styles.chapterLabelPassed : null,
                            ]}
                            numberOfLines={1}
                          >
                            {chapter.title}
                          </Text>
                        </Pressable>
                      )
                    })
                  )
                ) : null}
              </View>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}

export function ClassroomRightPane() {
  const classroomUi = useOptionalClassroomUi()
  if (classroomUi?.recordsOpen) {
    return <ClassroomRecordsPane onOpenClassroom={() => classroomUi.closeRecords()} />
  }
  return <AgentRightPane key="classroom" />
}

function IconTopic({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7 4h10a2 2 0 0 1 2 2v14l-7-3-7 3V6a2 2 0 0 1 2-2z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: 8,
    marginBottom: 6,
    gap: 6,
  },
  courseRow: {
    minHeight: 36,
    paddingRight: 10,
    paddingLeft: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  courseRowActive: {
    backgroundColor: colors.hover,
  },
  expandHit: {
    width: 16,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHitPressed: {
    opacity: 0.7,
  },
  chevron: {
    fontSize: 12,
    lineHeight: 14,
    color: colors.textSecondary,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  courseNameHit: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  courseName: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  courseNameActive: {
    color: colors.text,
    fontWeight: '500',
  },
  emptyChapters: {
    marginLeft: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  chapterItem: {
    marginLeft: 32,
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chapterItemActive: {
    backgroundColor: colors.accentSoft,
  },
  chapterItemPressed: {
    backgroundColor: colors.hover,
  },
  chapterItemLocked: {
    opacity: 0.45,
  },
  chapterIcon: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  chapterLabelActive: {
    color: colors.text,
    fontWeight: '500',
  },
  chapterLabelPassed: {
    opacity: 0.85,
  },
})
