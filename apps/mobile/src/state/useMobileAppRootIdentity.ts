import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { loadAuthStore } from '../auth/localAuth'
import type { AgentChatScope } from '../chat/agentScopes'
import {
  loadAccessToken,
  loadIdentity,
  loadModelConfig,
} from '../storage/secure'
import {
  bindStoredDeviceIdentity,
  loadOrCreateDeviceIdentity,
} from '../storage/deviceIdentity'
import { useP2pInviteLink } from '../p2p/useP2pInviteLink'
import { stopAllMailboxSync } from '../p2p/mailboxSync'
import { switchNoteMirrorsForIdentity } from '../p2p/noteMirror'
import { resetPendingInvitesCache } from '../p2p/pendingInvites'
import { clearLastSeqMemory } from '../p2p/session'
import { emptyChatSessionsStore, loadChatSessions } from '../storage/chatSessions'
import {
  emptyNotesStore,
  loadNotesStore,
  type MobileNote,
  type MobileNotebook,
  type NoteTombstone,
} from '../storage/notes'
import { loadKnowledgeSnapshot, resetKnowledgeSnapshotMemory } from '../storage/knowledgeSnapshot'
import { setAllowLegacyDataClaim, setCurrentDataIdentity, getCurrentDataIdentity } from '../storage/identityScope'
import { loadClassroomCourses } from '../storage/classroomCourses'
import { loadModulePrefs, type ModulePrefs } from '../settings/prefs'
import { isTopNavModuleId } from '../settings/nav-visibility'
import { resetMobileSyncBaseUrlCache, type KnowledgeMetaItem } from '../sync/mobileSync'
import { EMPTY_MOBILE_SYNC_STATE, loadMobileSyncState, type MobileSyncState } from '../sync/syncState'
import { resetGroupSyncSnapshot } from '../sync/groupSyncBridge'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import { listedSyncKnowledgeItems } from '../features/knowledgeSidebar'
import type { MobileModuleId } from '../modules'
import type { AuthSession, ChatSession, MobileAgent, MobileDeviceInfo, ModelConfig } from './MobileAppContext'
import { legacySessionFromSecure } from './mobileAppBootstrap'

type ApplyWorkspaceInput = {
  chat: Awaited<ReturnType<typeof loadChatSessions>>
  notesStore: Awaited<ReturnType<typeof loadNotesStore>>
  knowledgeSnap: Awaited<ReturnType<typeof loadKnowledgeSnapshot>>
  classroomStore: Awaited<ReturnType<typeof loadClassroomCourses>>
  syncState: Awaited<ReturnType<typeof loadMobileSyncState>>
}

export function useMobileAppRootIdentity(input: {
  setModule: Dispatch<SetStateAction<MobileModuleId>>
  setAuth: Dispatch<SetStateAction<AuthSession>>
  setDevice: Dispatch<SetStateAction<MobileDeviceInfo>>
  setModelConfig: Dispatch<SetStateAction<ModelConfig>>
  setSessions: Dispatch<SetStateAction<ChatSession[]>>
  setAgents: Dispatch<SetStateAction<MobileAgent[]>>
  setActiveSessionByScope: Dispatch<SetStateAction<Record<AgentChatScope, string | null>>>
  setNotebooks: Dispatch<SetStateAction<MobileNotebook[]>>
  setNotes: Dispatch<SetStateAction<MobileNote[]>>
  setDeletedNotes: Dispatch<SetStateAction<NoteTombstone[]>>
  setKnowledgeMeta: Dispatch<SetStateAction<KnowledgeMetaItem[]>>
  setClassroomCourses: Dispatch<SetStateAction<MobileClassroomCourse[]>>
  setActiveNoteId: Dispatch<SetStateAction<string | null>>
  setModulePrefs: Dispatch<SetStateAction<ModulePrefs>>
  setSyncCursor: Dispatch<SetStateAction<string | null>>
  setReady: Dispatch<SetStateAction<boolean>>
  ready: boolean
  auth: AuthSession
  syncStateRef: MutableRefObject<MobileSyncState>
  classroomCourseIdsRef: MutableRefObject<string[]>
}) {
  const {
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
  } = input

  const dataIdentityRef = useRef<string | null>(null)
  const applyingIdentityRef = useRef(false)

  const applyUserWorkspace = (workspace: ApplyWorkspaceInput) => {
    setSessions(workspace.chat.sessions)
    setAgents(workspace.chat.agents)
    setActiveSessionByScope(workspace.chat.activeSessionByScope)
    setNotebooks(workspace.notesStore.notebooks)
    setNotes(workspace.notesStore.notes)
    setDeletedNotes(workspace.notesStore.deletedNotes)
    setActiveNoteId(workspace.notesStore.activeNoteId)
    setClassroomCourses(workspace.classroomStore)
    classroomCourseIdsRef.current = workspace.classroomStore.map((course) => course.id)
    syncStateRef.current = workspace.syncState
    setSyncCursor(workspace.syncState.cursor)
    setKnowledgeMeta(
      workspace.knowledgeSnap
        ? listedSyncKnowledgeItems(
            workspace.knowledgeSnap.kbs
              .filter((kb) => kb.kind === 'sync')
              .map((kb) => ({
                id: kb.id,
                name: kb.name,
                kind: kb.kind,
                documentCount: kb.documentCount,
                updatedAt: kb.updatedAt,
              })),
          )
        : [],
    )
  }

  useEffect(() => {
    void (async () => {
      const [authStore, identity, token, model, prefs, deviceRecord] = await Promise.all([
        loadAuthStore(),
        loadIdentity(),
        loadAccessToken(),
        loadModelConfig(),
        loadModulePrefs(),
        loadOrCreateDeviceIdentity(),
      ])
      setModelConfig(model)
      setModulePrefs(prefs)
      if (prefs.app.restoreLastSession && isTopNavModuleId(prefs.app.lastModule)) {
        const last = prefs.app.lastModule
        if (prefs.nav.visibleModuleIds.includes(last)) setModule(last)
      }
      const session = authStore.session
        ? authStore.session
        : identity && token
          ? legacySessionFromSecure(identity, token)
          : null
      if (session) setAuth(session)
      const identityId = session?.identityId ?? null
      setCurrentDataIdentity(identityId)
      setAllowLegacyDataClaim(
        Boolean(identityId) &&
          authStore.accounts.length === 1 &&
          authStore.accounts[0]?.identityId === identityId,
      )
      dataIdentityRef.current = identityId
      const [chat, notesStore, knowledgeSnap, classroomStore, syncState] = await Promise.all([
        loadChatSessions(),
        loadNotesStore(),
        loadKnowledgeSnapshot(),
        loadClassroomCourses(),
        loadMobileSyncState(),
      ])
      applyUserWorkspace({ chat, notesStore, knowledgeSnap, classroomStore, syncState })
      const bound = session
        ? await bindStoredDeviceIdentity(session.identityId)
        : deviceRecord
      setDevice({
        deviceId: bound.deviceId,
        identityId: bound.identityId,
        kind: 'mobile',
      })
      setReady(true)
    })()
  }, [])

  useEffect(() => {
    if (!ready) return
    const next = auth?.identityId ?? null
    if (next === dataIdentityRef.current) return
    applyingIdentityRef.current = true
    switchNoteMirrorsForIdentity()
    stopAllMailboxSync()
    resetPendingInvitesCache()
    resetGroupSyncSnapshot()
    clearLastSeqMemory()
    resetKnowledgeSnapshotMemory()
    resetMobileSyncBaseUrlCache()
    setCurrentDataIdentity(next)
    setAllowLegacyDataClaim(false)
    applyUserWorkspace({
      chat: emptyChatSessionsStore(),
      notesStore: emptyNotesStore(),
      knowledgeSnap: null,
      classroomStore: [],
      syncState: { ...EMPTY_MOBILE_SYNC_STATE },
    })
    void (async () => {
      const [chat, notesStore, knowledgeSnap, classroomStore, syncState] = await Promise.all([
        loadChatSessions(),
        loadNotesStore(),
        loadKnowledgeSnapshot(),
        loadClassroomCourses(),
        loadMobileSyncState(),
      ])
      if (getCurrentDataIdentity() !== next) return
      dataIdentityRef.current = next
      applyUserWorkspace({ chat, notesStore, knowledgeSnap, classroomStore, syncState })
      if (!next) syncStateRef.current = { ...EMPTY_MOBILE_SYNC_STATE }
      applyingIdentityRef.current = false
    })()
  }, [ready, auth?.identityId])

  useEffect(() => {
    if (!ready) return
    void bindStoredDeviceIdentity(auth?.identityId ?? null).then((bound) => {
      setDevice({
        deviceId: bound.deviceId,
        identityId: bound.identityId,
        kind: 'mobile',
      })
    })
  }, [auth?.identityId, ready])

  useP2pInviteLink(ready)

  return { dataIdentityRef, applyingIdentityRef }
}
