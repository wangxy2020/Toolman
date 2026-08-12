import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadAuthStore } from '../auth/localAuth'
import type { MobileAuthSession } from '../auth/types'
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
} from '../storage/notes'
import { DEFAULT_MODULE_PREFS, loadModulePrefs, type ModulePrefs } from '../settings/prefs'
import { DEFAULT_SETTINGS_TAB, type SettingsTabId } from '../settings/tabs'
import { pullAndApplySync, pushNoteChanges, countDesktopHostsOnline, type KnowledgeMetaItem } from '../sync/mobileSync'
import type { MobileModuleId } from '../modules'
import {
  MobileAppProvider,
  type AuthSession,
  type ChatSession,
  type ModelConfig,
  type SyncStatus,
} from './MobileAppContext'

const EMPTY_ACTIVE: Record<AgentChatScope, string | null> = {
  agent: null,
  classroom: null,
  projects: null,
}

function legacySessionFromSecure(
  identity: { identityId: string; displayName: string },
  accessToken: string,
): MobileAuthSession {
  return {
    identityId: identity.identityId,
    displayName: identity.displayName,
    accessToken,
    email: '',
    phone: null,
    accountKind: 'email',
    region: 'cn',
    subscriptionSku: 'community',
    entitlements: [],
    communityRole: null,
    lastLoginAt: Date.now(),
  }
}

export function MobileAppRoot({ children }: { children: ReactNode }) {
  const [module, setModule] = useState<MobileModuleId>('agent')
  const [leftOpen, setLeftOpen] = useState(false)
  const [auth, setAuth] = useState<AuthSession>(null)
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionByScope, setActiveSessionByScope] =
    useState<Record<AgentChatScope, string | null>>(EMPTY_ACTIVE)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncCursor, setSyncCursor] = useState<string | null>(null)
  const [desktopHostsOnline, setDesktopHostsOnline] = useState(0)
  const [notebooks, setNotebooks] = useState<MobileNotebook[]>([])
  const [notes, setNotes] = useState<MobileNote[]>([])
  const [knowledgeMeta, setKnowledgeMeta] = useState<KnowledgeMetaItem[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB)
  const [modulePrefs, setModulePrefs] = useState<ModulePrefs>(DEFAULT_MODULE_PREFS)
  const [ready, setReady] = useState(false)

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
      const [authStore, identity, token, model, prefs, chat, notesStore] = await Promise.all([
        loadAuthStore(),
        loadIdentity(),
        loadAccessToken(),
        loadModelConfig(),
        loadModulePrefs(),
        loadChatSessions(),
        loadNotesStore(),
      ])
      setModelConfig(model)
      setModulePrefs(prefs)
      setSessions(chat.sessions)
      setActiveSessionByScope(chat.activeSessionByScope)
      setNotebooks(notesStore.notebooks)
      setNotes(notesStore.notes)
      setActiveNoteId(notesStore.activeNoteId)
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
    void saveNotesStore({ notebooks, notes, activeNoteId })
  }, [ready, notebooks, notes, activeNoteId])

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
    }, 8000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [ready])

  useEffect(() => {
    if (!ready || !auth) return
    let cancelled = false
    void (async () => {
      setSyncStatus('syncing')
      const applied = await pullAndApplySync({ cursor: syncCursor, notes, knowledgeMeta })
      if (cancelled) return
      setNotes(applied.notes)
      setKnowledgeMeta(applied.knowledgeMeta)
      setSyncCursor(applied.nextCursor)
      setDesktopHostsOnline(applied.hostsOnline)
      setSyncStatus('idle')
    })()
    return () => {
      cancelled = true
    }
    // intentional: bootstrap sync once after auth ready (notes already loaded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, auth?.identityId])

  // Local auto-save is above; optionally push edits to Sync API when enabled.
  useEffect(() => {
    if (!ready || !auth || !modulePrefs.notes.syncEnabled || !modulePrefs.notes.autoSyncOnEdit) {
      return
    }
    if (notes.length === 0) return
    const timer = setTimeout(() => {
      void pushNoteChanges(notes, syncCursor).catch(() => {
        // Keep local copy; surface status only on manual sync.
      })
    }, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, auth?.identityId, notes, modulePrefs.notes.syncEnabled, modulePrefs.notes.autoSyncOnEdit])

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
      knowledgeMeta,
      setKnowledgeMeta,
      activeNoteId,
      setActiveNoteId,
      showSettings,
      setShowSettings,
      settingsTab,
      setSettingsTab,
      modulePrefs,
      setModulePrefs,
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
      syncCursor,
      desktopHostsOnline,
      notebooks,
      notes,
      knowledgeMeta,
      activeNoteId,
      showSettings,
      settingsTab,
      modulePrefs,
    ],
  )

  if (!ready) return null
  return <MobileAppProvider value={value}>{children}</MobileAppProvider>
}
