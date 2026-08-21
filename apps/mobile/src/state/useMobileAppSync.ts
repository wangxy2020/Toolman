import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import type { ModulePrefs } from '../settings/prefs'
import type { MobileNote, NoteTombstone } from '../storage/notes'
import {
  AUTO_SYNC_INTERVAL_MS,
  AUTO_SYNC_MIN_GAP_MS,
  pullAndApplySync,
  pushNoteChanges,
  pushClassroomChanges,
  classifySyncFailure,
  formatSyncFailureMessage,
  isForeignSyncHubError,
  type KnowledgeMetaItem,
} from '../sync/mobileSync'
import { discardForeignPrivateWorkspace } from '../sync/mobileSync-pull-helpers'
import {
  EMPTY_MOBILE_SYNC_STATE,
  type MobileSyncState,
} from '../sync/syncState'
import { loadClassroomGuideDismissed } from '../storage/classroomCourses'
import { ensureMobileGuideClassroomCourses } from '../features/guideClassroomEnsure'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import type { AuthSession, ChatSession, MobileAgent, MobileSyncReason, SyncStatus } from './MobileAppContext'
import type { AgentChatScope } from '../chat/agentScopes'
import {
  isHostedPublicWebPage,
  primeLocalNetworkAccess,
  whenLocalNetworkAccessGranted,
} from '../sync/localNetworkFetch'

export function useMobileAppSync(input: {
  ready: boolean
  auth: AuthSession
  notes: MobileNote[]
  deletedNotes: NoteTombstone[]
  knowledgeMeta: KnowledgeMetaItem[]
  classroomCourses: MobileClassroomCourse[]
  modulePrefs: ModulePrefs
  setNotes: (notes: MobileNote[]) => void
  setDeletedNotes: (items: NoteTombstone[]) => void
  setKnowledgeMeta: (items: KnowledgeMetaItem[]) => void
  setClassroomCourses: (courses: MobileClassroomCourse[]) => void
  setSessions?: (sessions: ChatSession[]) => void
  setAgents?: (agents: MobileAgent[]) => void
  setActiveSessionByScope?: (next: Record<AgentChatScope, string | null>) => void
}) {
  const {
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
  } = input

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncCursor, setSyncCursor] = useState<string | null>(null)
  const [desktopHostsOnline, setDesktopHostsOnline] = useState(0)
  const syncStateRef = useRef<MobileSyncState>(EMPTY_MOBILE_SYNC_STATE)
  const prefsRef = useRef(modulePrefs)
  prefsRef.current = modulePrefs
  const syncingRef = useRef(false)
  const lastAutoSyncAtRef = useRef(0)
  const syncSnapshotRef = useRef({
    auth,
    notes,
    deletedNotes,
    knowledgeMeta,
    classroomCourses,
    syncCursor,
  })
  syncSnapshotRef.current = {
    auth,
    notes,
    deletedNotes,
    knowledgeMeta,
    classroomCourses,
    syncCursor,
  }

  const runSync = useCallback(async (reason: MobileSyncReason = 'manual'): Promise<string> => {
    const snapshot = syncSnapshotRef.current
    const prefs = prefsRef.current
    if (!snapshot.auth) return '未登录'
    const includeNotes = prefs.notes.syncEnabled
    const includeKnowledge = prefs.knowledge.syncEnabled
    const includeClassroom = prefs.classroom.syncEnabled
    if (syncingRef.current) {
      return reason === 'manual' ? '同步进行中' : ''
    }
    if (
      reason !== 'manual' &&
      reason !== 'bootstrap' &&
      Date.now() - lastAutoSyncAtRef.current < AUTO_SYNC_MIN_GAP_MS
    ) {
      return ''
    }

    syncingRef.current = true
    setSyncStatus('syncing')
    try {
      try {
        if (includeNotes) {
          syncStateRef.current = await pushNoteChanges(snapshot.notes, snapshot.syncCursor, {
            deletedNotes: snapshot.deletedNotes,
            syncState: syncStateRef.current,
          })
        }
        if (includeClassroom) {
          syncStateRef.current = await pushClassroomChanges(
            snapshot.classroomCourses,
            snapshot.syncCursor,
            { syncState: syncStateRef.current },
          )
        }
      } catch (error) {
        if (isForeignSyncHubError(error)) {
          const discarded = await discardForeignPrivateWorkspace(syncStateRef.current)
          syncStateRef.current = discarded.syncState
          setNotes(discarded.notes.notes)
          setDeletedNotes(discarded.notes.deletedNotes)
          setKnowledgeMeta([])
          setClassroomCourses(ensureMobileGuideClassroomCourses([], await loadClassroomGuideDismissed()))
          setSyncCursor(null)
          setDesktopHostsOnline(0)
          setSyncStatus('offline')
          return formatSyncFailureMessage(error)
        }
        setSyncStatus(classifySyncFailure(error))
        return formatSyncFailureMessage(error)
      }
      const applied = await pullAndApplySync({
        cursor: snapshot.syncCursor,
        notes: snapshot.notes,
        deletedNotes: snapshot.deletedNotes,
        knowledgeMeta: snapshot.knowledgeMeta,
        classroomCourses: snapshot.classroomCourses,
        includeNotes,
        includeKnowledge,
        includeClassroom,
        includeKnowledgeSnapshot: includeKnowledge,
        syncState: syncStateRef.current,
      })
      syncStateRef.current = applied.syncState
      setNotes(applied.notes)
      setDeletedNotes(applied.deletedNotes)
      setKnowledgeMeta(applied.knowledgeMeta)
      setClassroomCourses(
        ensureMobileGuideClassroomCourses(
          applied.classroomCourses,
          await loadClassroomGuideDismissed(),
        ),
      )
      if (applied.discardedForeign) {
        setSyncCursor(null)
        setDesktopHostsOnline(0)
        setSyncStatus('offline')
        return '检测到其他账号的同步节点，已跳过。请确认手机与桌面登录同一账号，并开启桌面「与移动端同步」。'
      }
      setSyncCursor(applied.nextCursor)
      setDesktopHostsOnline(applied.hostsOnline)
      lastAutoSyncAtRef.current = Date.now()
      setSyncStatus('idle')
      const transportLabel =
        applied.transport === 'community-hub'
          ? '已通过官方社区 Hub 跨网同步'
          : applied.transport === 'webrtc'
            ? '已通过点到点 WebRTC 同步'
            : applied.transport === 'personal-mailbox'
              ? '已通过加密个人投递盒同步'
              : '已通过局域网 Sync Hub 同步'
      const summary = `${transportLabel}：笔记 ${applied.notes.length} 篇，知识库 ${applied.knowledgeMeta.length} 个（${applied.documentCount} 篇文档），课程 ${applied.classroomCourses.length} 门，群组 ${applied.groups.length} 个`
      if (applied.knowledgeWanSkipped && includeKnowledge) {
        return `${summary}。${applied.knowledgeError ?? '知识库文件需同局域网补拉'}`
      }
      return applied.knowledgeError && includeKnowledge
        ? `${summary}。知识库文件稍后再试：${applied.knowledgeError}`
        : summary
    } catch (error) {
      if (isForeignSyncHubError(error)) {
        const discarded = await discardForeignPrivateWorkspace(syncStateRef.current)
        syncStateRef.current = discarded.syncState
        setNotes(discarded.notes.notes)
        setDeletedNotes(discarded.notes.deletedNotes)
        setKnowledgeMeta([])
        setClassroomCourses([])
        setSyncCursor(null)
        setDesktopHostsOnline(0)
        setSyncStatus('offline')
        return formatSyncFailureMessage(error)
      }
      setSyncStatus(classifySyncFailure(error))
      return formatSyncFailureMessage(error)
    } finally {
      syncingRef.current = false
    }
  }, [setNotes, setDeletedNotes, setKnowledgeMeta, setClassroomCourses])

  useEffect(() => {
    if (!ready || !auth) return
    if (!isHostedPublicWebPage()) {
      void runSync('bootstrap')
      return
    }
    const start = () => {
      void primeLocalNetworkAccess().then(() => {
        void runSync('bootstrap')
      })
    }
    return whenLocalNetworkAccessGranted(start)
  }, [ready, auth?.identityId, runSync])

  useEffect(() => {
    if (!ready || !auth) return
    const timer = setInterval(() => {
      void runSync('interval')
    }, AUTO_SYNC_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ready, auth?.identityId, runSync])

  useEffect(() => {
    if (!ready || !auth) return
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return
      void runSync('foreground')
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [ready, auth?.identityId, runSync])

  useEffect(() => {
    if (!ready || !auth || !modulePrefs.notes.syncEnabled || !modulePrefs.notes.autoSyncOnEdit) {
      return
    }
    if (notes.length === 0 && deletedNotes.length === 0) return
    const timer = setTimeout(() => {
      void pushNoteChanges(notes, syncCursor, {
        deletedNotes,
        syncState: syncStateRef.current,
      })
        .then((next) => {
          syncStateRef.current = next
        })
        .catch(() => {
          // Keep local copy; the next open / 3-minute / manual sync retries.
        })
    }, 1200)
    return () => clearTimeout(timer)
  }, [ready, auth?.identityId, notes, deletedNotes, modulePrefs.notes.syncEnabled, modulePrefs.notes.autoSyncOnEdit])

  useEffect(() => {
    if (!ready || !auth || !modulePrefs.classroom.syncEnabled) return
    if (classroomCourses.length === 0 && Object.keys(syncStateRef.current.classroomStamps).length === 0) {
      return
    }
    const timer = setTimeout(() => {
      void pushClassroomChanges(classroomCourses, syncCursor, {
        syncState: syncStateRef.current,
      })
        .then((next) => {
          syncStateRef.current = next
        })
        .catch(() => {
          // Keep local copy; the next open / 3-minute / manual sync retries.
        })
    }, 1200)
    return () => clearTimeout(timer)
  }, [ready, auth?.identityId, classroomCourses, modulePrefs.classroom.syncEnabled])

  return {
    syncStatus,
    setSyncStatus,
    syncCursor,
    setSyncCursor,
    desktopHostsOnline,
    setDesktopHostsOnline,
    runSync,
    syncStateRef,
  }
}
