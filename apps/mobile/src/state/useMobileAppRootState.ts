import { useCallback, useMemo, useRef, useState } from 'react'
import {
  resolveAgentChatScope,
  type AgentChatScope,
} from '../chat/agentScopes'
import { DEFAULT_MODEL_CONFIG } from '../storage/secure'
import type { MobileNote, MobileNotebook, NoteTombstone } from '../storage/notes'
import { DEFAULT_MODULE_PREFS, type ModulePrefs } from '../settings/prefs'
import { DEFAULT_SETTINGS_TAB, type SettingsTabId } from '../settings/tabs'
import type { KnowledgeMetaItem } from '../sync/mobileSync'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import type { MobileModuleId } from '../modules'
import type {
  AuthSession,
  ChatSession,
  MobileAgent,
  MobileAppState,
  MobileDeviceInfo,
  ModelConfig,
} from './MobileAppContext'
import { EMPTY_ACTIVE } from './mobileAppBootstrap'
import { useMobileAppSync } from './useMobileAppSync'
import { useMobileAppRootIdentity } from './useMobileAppRootIdentity'
import { useMobileAppRootPersistence } from './useMobileAppRootPersistence'

export function useMobileAppRootState(): {
  ready: boolean
  modulePrefs: ModulePrefs
  value: MobileAppState
} {
  const [module, setModule] = useState<MobileModuleId>('agent')
  const [leftOpen, setLeftOpen] = useState(false)
  const [auth, setAuth] = useState<AuthSession>(null)
  const [device, setDevice] = useState<MobileDeviceInfo>({
    deviceId: '',
    identityId: null,
    kind: 'mobile',
  })
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [agents, setAgents] = useState<MobileAgent[]>([])
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
    setSessions,
    setAgents,
    setActiveSessionByScope,
  })

  const { dataIdentityRef, applyingIdentityRef } = useMobileAppRootIdentity({
    setModule,
    setAuth,
    setDevice,
    setModelConfig,
    setSessions,
    setAgents,
    setActiveSessionByScope,
    setNotebooks,
    setNotes,
    setDeletedNotes,
    setKnowledgeMeta,
    setClassroomCourses,
    setActiveNoteId,
    setModulePrefs,
    setSyncCursor,
    setReady,
    ready,
    auth,
    syncStateRef,
    classroomCourseIdsRef,
  })

  useMobileAppRootPersistence({
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
    setAgents,
    setActiveSessionByScope,
    setModulePrefs,
    setDesktopHostsOnline,
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

  const upsertAgent = useCallback((agent: MobileAgent) => {
    setAgents((prev) => {
      const rest = prev.filter((item) => item.id !== agent.id)
      return [...rest, agent].sort((a, b) => a.createdAt - b.createdAt)
    })
  }, [])

  const renameAgent = useCallback((id: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    setAgents((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: nextName } : item)),
    )
  }, [])

  const removeAgent = useCallback((id: string) => {
    setAgents((prev) => prev.filter((item) => item.id !== id))
    setSessions((prev) => {
      const removedIds = new Set(
        prev.filter((item) => item.assistantId === id).map((item) => item.id),
      )
      if (removedIds.size === 0) return prev
      const next = prev.filter((item) => item.assistantId !== id)
      setActiveSessionByScope((activePrev) => {
        let changed = false
        const updated = { ...activePrev }
        for (const scope of Object.keys(activePrev) as AgentChatScope[]) {
          const activeId = activePrev[scope]
          if (activeId && removedIds.has(activeId)) {
            updated[scope] =
              next.find((item) => item.agentScope === scope)?.id ?? null
            changed = true
          }
        }
        return changed ? updated : activePrev
      })
      return next
    })
  }, [])

  const value = useMemo(
    (): MobileAppState => ({
      module,
      setModule,
      leftOpen,
      setLeftOpen,
      auth,
      setAuth,
      device,
      modelConfig,
      setModelConfig,
      sessions,
      agents,
      setAgents,
      activeSessionId,
      setActiveSessionId,
      activeSessionByScope,
      upsertSession,
      renameSession,
      removeSession,
      upsertAgent,
      renameAgent,
      removeAgent,
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
      device,
      modelConfig,
      sessions,
      agents,
      activeSessionId,
      setActiveSessionId,
      activeSessionByScope,
      upsertSession,
      renameSession,
      removeSession,
      upsertAgent,
      renameAgent,
      removeAgent,
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

  return { ready, modulePrefs, value }
}
