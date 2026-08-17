import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { AgentChatScope } from '../chat/agentScopes'
import { saveChatSessions } from '../storage/chatSessions'
import {
  saveNotesStore,
  type MobileNote,
  type MobileNotebook,
  type NoteTombstone,
} from '../storage/notes'
import { getCurrentDataIdentity } from '../storage/identityScope'
import { saveClassroomCourses } from '../storage/classroomCourses'
import { saveModulePrefs, type ModulePrefs } from '../settings/prefs'
import { isTopNavModuleId } from '../settings/nav-visibility'
import { AUTO_SYNC_INTERVAL_MS, countDesktopHostsOnline } from '../sync/mobileSync'
import {
  applyClassroomCoursesToSessions,
  type MobileClassroomCourse,
} from '../sync/classroomSyncMerge'
import { orderClassroomCourses, resolveClassroomSidebarFocus } from '../features/classroomSidebar'
import type { MobileModuleId } from '../modules'
import type { ChatSession, MobileAgent } from './MobileAppContext'
import { classroomSessionFromCourse } from './mobileAppBootstrap'

export function useMobileAppRootPersistence(input: {
  ready: boolean
  applyingIdentityRef: MutableRefObject<boolean>
  dataIdentityRef: MutableRefObject<string | null>
  classroomCourseIdsRef: MutableRefObject<string[]>
  sessions: ChatSession[]
  agents: MobileAgent[]
  activeSessionByScope: Record<AgentChatScope, string | null>
  notebooks: MobileNotebook[]
  notes: MobileNote[]
  activeNoteId: string | null
  deletedNotes: NoteTombstone[]
  classroomCourses: MobileClassroomCourse[]
  module: MobileModuleId
  modulePrefs: ModulePrefs
  setSessions: Dispatch<SetStateAction<ChatSession[]>>
  setAgents: Dispatch<SetStateAction<MobileAgent[]>>
  setActiveSessionByScope: Dispatch<SetStateAction<Record<AgentChatScope, string | null>>>
  setModulePrefs: Dispatch<SetStateAction<ModulePrefs>>
  setDesktopHostsOnline: (count: number) => void
}) {
  const {
    ready,
    applyingIdentityRef,
    dataIdentityRef,
    classroomCourseIdsRef,
    sessions,
    agents,
    activeSessionByScope,
    notebooks,
    notes,
    activeNoteId,
    deletedNotes,
    classroomCourses,
    module,
    modulePrefs,
    setSessions,
    setActiveSessionByScope,
    setModulePrefs,
    setDesktopHostsOnline,
  } = input

  useEffect(() => {
    if (!ready || applyingIdentityRef.current) return
    if (getCurrentDataIdentity() !== dataIdentityRef.current) return
    void saveChatSessions({ sessions, agents, activeSessionByScope })
  }, [ready, sessions, agents, activeSessionByScope])

  useEffect(() => {
    if (!ready || applyingIdentityRef.current) return
    if (getCurrentDataIdentity() !== dataIdentityRef.current) return
    void saveNotesStore({ notebooks, notes, activeNoteId, deletedNotes })
  }, [ready, notebooks, notes, activeNoteId, deletedNotes])

  useEffect(() => {
    if (!ready || applyingIdentityRef.current) return
    if (getCurrentDataIdentity() !== dataIdentityRef.current) return
    void saveClassroomCourses(classroomCourses)
  }, [ready, classroomCourses])

  useEffect(() => {
    if (!ready) return
    const prevIds = classroomCourseIdsRef.current
    setSessions((prev) =>
      applyClassroomCoursesToSessions(
        prev,
        prevIds,
        classroomCourses,
        classroomSessionFromCourse,
      ),
    )
    const visibleIds = new Set(orderClassroomCourses(classroomCourses).map((course) => course.id))
    setActiveSessionByScope((active) => {
      if (active.classroom && visibleIds.has(active.classroom)) return active
      const nextId =
        resolveClassroomSidebarFocus(classroomCourses, active.classroom)?.courseId ??
        orderClassroomCourses(classroomCourses)[0]?.id ??
        null
      if (active.classroom === nextId) return active
      return { ...active, classroom: nextId }
    })
    classroomCourseIdsRef.current = classroomCourses.map((course) => course.id)
  }, [ready, classroomCourses])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void (async () => {
      const hostsOnline = await countDesktopHostsOnline()
      if (!cancelled) setDesktopHostsOnline(hostsOnline)
    })()
    const timer = setInterval(() => {
      void countDesktopHostsOnline().then((hostsOnline) => {
        if (!cancelled) setDesktopHostsOnline(hostsOnline)
      })
    }, AUTO_SYNC_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [ready, setDesktopHostsOnline])

  const prefsRef = useRef(modulePrefs)
  prefsRef.current = modulePrefs

  useEffect(() => {
    if (!ready) return
    const prefs = prefsRef.current
    if (!prefs.app.restoreLastSession) return
    if (!isTopNavModuleId(module) || prefs.app.lastModule === module) return
    const next = { ...prefs, app: { ...prefs.app, lastModule: module } }
    setModulePrefs(next)
    void saveModulePrefs(next)
  }, [module, ready])
}
