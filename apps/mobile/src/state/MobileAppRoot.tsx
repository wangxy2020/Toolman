import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadAuthStore } from '../auth/localAuth'
import {
  resolveAgentChatScope,
  type AgentChatScope,
} from '../chat/agentScopes'
import {
  DEFAULT_MODEL_CONFIG,
  loadAccessToken,
  loadIdentity,
  loadModelConfig,
} from '../storage/secure'
import { loadChatSessions, saveChatSessions } from '../storage/chatSessions'
import {
  loadNotesStore,
  saveNotesStore,
  type MobileNote,
  type MobileNotebook,
  type NoteTombstone,
} from '../storage/notes'
import { loadKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import { loadClassroomCourses, saveClassroomCourses } from '../storage/classroomCourses'
import { DEFAULT_MODULE_PREFS, loadModulePrefs, saveModulePrefs, type ModulePrefs } from '../settings/prefs'
import { isTopNavModuleId } from '../settings/nav-visibility'
import { I18nProvider } from '../i18n'
import { DEFAULT_SETTINGS_TAB, type SettingsTabId } from '../settings/tabs'
import {
  AUTO_SYNC_INTERVAL_MS,
  countDesktopHostsOnline,
  type KnowledgeMetaItem,
} from '../sync/mobileSync'
import { loadMobileSyncState } from '../sync/syncState'
import {
  applyClassroomCoursesToSessions,
  type MobileClassroomCourse,
} from '../sync/classroomSyncMerge'
import { listedSyncKnowledgeItems } from '../features/knowledgeSidebar'
import { orderClassroomCourses, resolveClassroomSidebarFocus } from '../features/classroomSidebar'
import type { MobileModuleId } from '../modules'
import {
  MobileAppProvider,
  type AuthSession,
  type ChatSession,
  type ModelConfig,
} from './MobileAppContext'
import {
  classroomSessionFromCourse,
  EMPTY_ACTIVE,
  legacySessionFromSecure,
} from './mobileAppBootstrap'
import { useMobileAppSync } from './useMobileAppSync'

export function MobileAppRoot({ children }: { children: ReactNode }) {
  const [module, setModule] = useState<MobileModuleId>('agent')
  const [leftOpen, setLeftOpen] = useState(false)
  const [auth, setAuth] = useState<AuthSession>(null)
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionByScope, setActiveSessionByScope] =
    useState<Record<AgentChatScope, string | null>>(EMPTY_ACTIVE)
  const [notebooks, setNotebooks] = useState<MobileNotebook[]>([])
  const [notes, setNotes] = useState<MobileNote[]>([])
  const [deletedNotes, setDeletedNotes] = useState<NoteTombstone[]>([])
  const [knowledgeMeta, setKnowledgeMeta] = useState<KnowledgeMetaItem[]>([])
  const [classroomCourses, setClassroomCourses] = useState<MobileClassroomCourse[]>([])
  const classroomCourseIdsRef = useRef<string[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB)
  const [modulePrefs, setModulePrefs] = useState<ModulePrefs>(DEFAULT_MODULE_PREFS)
  const [ready, setReady] = useState(false)

  const {
    syncStatus,
    setSyncStatus,
    syncCursor,
    setSyncCursor,
    desktopHostsOnline,
    setDesktopHostsOnline,
    runSync,
    syncStateRef,
  } = useMobileAppSync({
    ready,
    auth,
    notes,
    deletedNotes,
    knowledgeMeta,
    classroomCourses,
    modulePrefs,
    setNotes,
    setDeletedNotes,
    setKnowledgeMeta,
    setClassroomCourses,
  })

  const agentScope = resolveAgentChatScope(module)
  const activeSessionId = activeSessionByScope[agentScope]

  const setActiveSessionId = useCallback(
    (id: string | null) => {
      setActiveSessionByScope((prev) => ({ ...prev, [agentScope]: id }))
    },
    [agentScope],
  )

  const upsertSession = useCallback((session: ChatSession) => {
    setSessions((prev) => {
      const rest = prev.filter((item) => item.id !== session.id)
      return [session, ...rest].sort((a, b) => b.updatedAt - a.updatedAt)
    })
    // Keep the owning page’s active topic aligned with the session being written
    // (avoids a race where activeSessionId is briefly unset and generation looks empty).
    setActiveSessionByScope((prev) => ({
      ...prev,
      [session.agentScope]: session.id,
    }))
  }, [])

  const renameSession = useCallback((id: string, title: string) => {
    const nextTitle = title.trim()
    if (!nextTitle) return
    setSessions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: nextTitle } : item)),
    )
  }, [])

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => {
      const target = prev.find((item) => item.id === id)
      if (!target) return prev
      const next = prev.filter((item) => item.id !== id)
      setActiveSessionByScope((activePrev) => {
        if (activePrev[target.agentScope] !== id) return activePrev
        const fallback =
          next.find((item) => item.agentScope === target.agentScope)?.id ?? null
        return { ...activePrev, [target.agentScope]: fallback }
      })
      return next
    })
  }, [])

  useEffect(() => {
    void (async () => {
      const [authStore, identity, token, model, prefs, chat, notesStore, knowledgeSnap, classroomStore, syncState] =
        await Promise.all([
          loadAuthStore(),
          loadIdentity(),
          loadAccessToken(),
          loadModelConfig(),
          loadModulePrefs(),
          loadChatSessions(),
          loadNotesStore(),
          loadKnowledgeSnapshot(),
          loadClassroomCourses(),
          loadMobileSyncState(),
        ])
      setModelConfig(model)
      setModulePrefs(prefs)
      if (prefs.app.restoreLastSession && isTopNavModuleId(prefs.app.lastModule)) {
        const last = prefs.app.lastModule
        if (prefs.nav.visibleModuleIds.includes(last)) setModule(last)
      }
      setSessions(chat.sessions)
      setActiveSessionByScope(chat.activeSessionByScope)
      setNotebooks(notesStore.notebooks)
      setNotes(notesStore.notes)
      setDeletedNotes(notesStore.deletedNotes)
      setActiveNoteId(notesStore.activeNoteId)
      setClassroomCourses(classroomStore)
      classroomCourseIdsRef.current = classroomStore.map((course) => course.id)
      syncStateRef.current = syncState
      setSyncCursor(syncState.cursor)
      if (knowledgeSnap) {
        setKnowledgeMeta(
          listedSyncKnowledgeItems(
            knowledgeSnap.kbs
              .filter((kb) => kb.kind === 'sync')
              .map((kb) => ({
                id: kb.id,
                name: kb.name,
                kind: kb.kind,
                documentCount: kb.documentCount,
                updatedAt: kb.updatedAt,
              })),
          ),
        )
      }
      if (authStore.session) {
        setAuth(authStore.session)
      } else if (identity && token) {
        setAuth(legacySessionFromSecure(identity, token))
      }
      setReady(true)
    })()
  }, [])

  useEffect(() => {
    if (!ready) return
    void saveChatSessions({ sessions, activeSessionByScope })
  }, [ready, sessions, activeSessionByScope])

  useEffect(() => {
    if (!ready) return
    void saveNotesStore({ notebooks, notes, activeNoteId, deletedNotes })
  }, [ready, notebooks, notes, activeNoteId, deletedNotes])

  useEffect(() => {
    if (!ready) return
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

  const value = useMemo(
    () => ({
      module,
      setModule,
      leftOpen,
      setLeftOpen,
      auth,
      setAuth,
      modelConfig,
      setModelConfig,
      sessions,
      activeSessionId,
      setActiveSessionId,
      activeSessionByScope,
      upsertSession,
      renameSession,
      removeSession,
      syncStatus,
      setSyncStatus,
      syncCursor,
      setSyncCursor,
      desktopHostsOnline,
      setDesktopHostsOnline,
      notebooks,
      setNotebooks,
      notes,
      setNotes,
      deletedNotes,
      setDeletedNotes,
      knowledgeMeta,
      setKnowledgeMeta,
      classroomCourses,
      setClassroomCourses,
      activeNoteId,
      setActiveNoteId,
      showSettings,
      setShowSettings,
      settingsTab,
      setSettingsTab,
      modulePrefs,
      setModulePrefs,
      runSync,
    }),
    [
      module,
      leftOpen,
      auth,
      modelConfig,
      sessions,
      activeSessionId,
      setActiveSessionId,
      activeSessionByScope,
      upsertSession,
      renameSession,
      removeSession,
      syncStatus,
      setSyncStatus,
      syncCursor,
      setSyncCursor,
      desktopHostsOnline,
      setDesktopHostsOnline,
      notebooks,
      notes,
      deletedNotes,
      knowledgeMeta,
      classroomCourses,
      activeNoteId,
      showSettings,
      settingsTab,
      modulePrefs,
      runSync,
    ],
  )

  if (!ready) return null
  return (
    <I18nProvider language={modulePrefs.app.language}>
      <MobileAppProvider value={value}>{children}</MobileAppProvider>
    </I18nProvider>
  )
}
