import { mergeKnowledgeSnapshot, type KnowledgeSnapshot, type SyncChange } from '@toolman/shared'
import type { ToolmanSyncClient } from '@toolman/sync-client'
import { getOrCreateDeviceId } from '../storage/secure'
import type { MobileNote, NoteTombstone } from '../storage/notes'
import { loadKnowledgeSnapshot, saveKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import { loadMobileSyncState, saveMobileSyncState, type MobileSyncState } from './syncState'
import { stampClassroomCourses } from './classroomPushDelta'
import { isSystemDefaultFolderName, listedSyncKnowledgeItems } from '../features/knowledgeSidebar'
import { mergeNotesFromSyncChanges } from './noteSyncMerge'
import {
  mergeClassroomCoursesFromSyncChanges,
  type MobileClassroomCourse,
} from './classroomSyncMerge'
import {
  emitGroupSync,
  persistGroupSyncSnapshot,
  readGroupSyncBaseline,
} from './groupSyncBridge'
import {
  mergeGroupMembersFromSyncChanges,
  mergeGroupsFromSyncChanges,
} from './groupSyncMerge'
import type { GroupWorkspace } from '../storage/groupChat'
import {
  classifyMobileSyncTransport,
  countDesktopHostsOnline,
  createReachableMobileSyncClient,
  isForeignSyncHubError,
  loadSyncIdentityId,
  type KnowledgeMetaItem,
  type MobileSyncTransport,
} from './mobileSync-client'
import {
  applyKnowledgeMetaChange,
  discardForeignPrivateWorkspace,
  hydrateOmittedFiles,
} from './mobileSync-pull-helpers'
import { pullPersonalMailboxChanges } from './personalMailboxSync'
import { tryDeviceSyncWebrtc } from './deviceSyncWebrtc'
import { loadDevicePairing } from '../storage/devicePairing'
import { shouldDiscardForeignPrivateWorkspace } from './syncIdentity'

export type AppliedSync = {
  notes: MobileNote[]
  deletedNotes: NoteTombstone[]
  knowledgeMeta: KnowledgeMetaItem[]
  classroomCourses: MobileClassroomCourse[]
  groups: GroupWorkspace[]
  nextCursor: string | null
  hostsOnline: number
  snapshot: KnowledgeSnapshot | null
  documentCount: number
  knowledgeError?: string
  /** Soft notice when WAN skips knowledge file export. */
  knowledgeWanSkipped?: boolean
  transport: MobileSyncTransport
  baseUrl: string
  syncState: MobileSyncState
  discardedForeign?: boolean
}

const KNOWLEDGE_WAN_SOFT_MESSAGE =
  '知识库正文与向量仅局域网 Sync Hub 可用；跨网 / 点到点首期只同步目录元数据，请稍后在 LAN 补拉文件'

async function appliedAfterDiscardingForeign(syncState: MobileSyncState): Promise<AppliedSync> {
  const discarded = await discardForeignPrivateWorkspace(syncState)
  return {
    notes: discarded.notes.notes,
    deletedNotes: discarded.notes.deletedNotes,
    knowledgeMeta: [],
    classroomCourses: [],
    groups: [],
    nextCursor: null,
    hostsOnline: 0,
    snapshot: null,
    documentCount: 0,
    transport: 'lan-hub',
    baseUrl: '',
    syncState: discarded.syncState,
    discardedForeign: true,
  }
}

/** Pull remote changes and merge notes + optional sync-KB snapshot (files, chunks, vectors). */
export async function pullAndApplySync(options: {
  client?: ToolmanSyncClient
  cursor: string | null
  notes: MobileNote[]
  deletedNotes?: NoteTombstone[]
  knowledgeMeta?: KnowledgeMetaItem[]
  classroomCourses?: MobileClassroomCourse[]
  includeNotes?: boolean
  includeClassroom?: boolean
  includeKnowledge?: boolean
  /** Full or incremental KB snapshot when meta changed or no local copy exists. */
  includeKnowledgeSnapshot?: boolean
  syncState?: MobileSyncState
}): Promise<AppliedSync> {
  const includeNotes = options.includeNotes !== false
  const includeClassroom = options.includeClassroom !== false
  const includeKnowledge = options.includeKnowledge !== false
  const includeKnowledgeSnapshot = options.includeKnowledgeSnapshot ?? includeKnowledge
  const syncState = options.syncState ?? (await loadMobileSyncState())
  if (shouldDiscardForeignPrivateWorkspace(await loadSyncIdentityId(), syncState)) {
    return appliedAfterDiscardingForeign(syncState)
  }
  const pairing = await loadDevicePairing()

  let client: ToolmanSyncClient | null = options.client ?? null
  let hubUnavailable: Error | null = null
  if (!client) {
    try {
      client = await createReachableMobileSyncClient()
    } catch (error) {
      if (isForeignSyncHubError(error)) return appliedAfterDiscardingForeign(syncState)
      hubUnavailable = error instanceof Error ? error : new Error(String(error))
      if (!pairing) throw hubUnavailable
    }
  }

  const baseUrl = client?.getBaseUrl() ?? pairing?.hubBaseUrlHint ?? 'personal-mailbox'
  const transport: MobileSyncTransport = client
    ? classifyMobileSyncTransport(baseUrl)
    : 'personal-mailbox'
  const deviceId = await getOrCreateDeviceId()

  const pulledChanges: SyncChange[] = []
  let cursor = options.cursor
  if (client) {
    try {
      for (let page = 0; page < 50; page += 1) {
        let pull
        try {
          pull = await client.pull({ deviceId, cursor, limit: 100 })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (/403|identity mismatch/i.test(message)) {
            return appliedAfterDiscardingForeign(syncState)
          }
          if (/401|unauthorized|未授权/i.test(message) && pairing) {
            // LAN token missing/wrong — continue with paired peer transports.
            break
          }
          throw error
        }
        pulledChanges.push(...pull.changes)
        const nextCursor = pull.nextCursor ?? cursor
        const hasMore = pull.hasMore === true || pull.changes.length >= 100
        cursor = nextCursor
        if (!hasMore || pull.changes.length === 0) break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isForeignSyncHubError(error) || /identity mismatch/i.test(message)) {
        return appliedAfterDiscardingForeign(syncState)
      }
      if (!pairing) throw error
    }
  }

  let effectiveTransport: MobileSyncTransport = transport
  // Prefer LAN HTTP. Attempt WebRTC when not on lan-hub, or when HTTP hub is unavailable.
  if (transport !== 'lan-hub' || !client) {
    try {
      if (pairing) {
        const webrtc = await tryDeviceSyncWebrtc(pairing)
        if (webrtc.ok) {
          pulledChanges.push(...webrtc.changes)
          effectiveTransport = 'webrtc'
        }
      }
    } catch {
      // WebRTC is best-effort; fall through to mailbox / HTTP.
    }
  }
  try {
    const mailbox = await pullPersonalMailboxChanges(pairing)
    if (mailbox && mailbox.changes.length > 0) {
      pulledChanges.push(...mailbox.changes)
      if (effectiveTransport !== 'webrtc' && (transport !== 'lan-hub' || !client)) {
        effectiveTransport = 'personal-mailbox'
      }
    } else if (!client && pulledChanges.length === 0 && effectiveTransport !== 'webrtc') {
      throw (
        hubUnavailable ??
        new Error(
          '已配对但未能拉取变更。请确认桌面在线：localhost/局域网走 Sync Hub；托管网页需点到点 WebRTC 或 HTTPS 桌面地址（不依赖官方 Hub）。',
        )
      )
    }
  } catch (error) {
    if (!client && pulledChanges.length === 0 && effectiveTransport !== 'webrtc') throw error
    // Personal mailbox is best-effort when HTTP already returned changes.
  }

  const merged = includeNotes
    ? mergeNotesFromSyncChanges(options.notes, options.deletedNotes ?? [], pulledChanges)
    : { notes: options.notes, deletedNotes: options.deletedNotes ?? [] }
  const classroomCourses = includeClassroom
    ? mergeClassroomCoursesFromSyncChanges(options.classroomCourses ?? [], pulledChanges)
    : (options.classroomCourses ?? [])
  const groupStore = await readGroupSyncBaseline()
  const groups = mergeGroupsFromSyncChanges(groupStore.groups, pulledChanges)
  const membersByGroup = mergeGroupMembersFromSyncChanges(
    groupStore.membersByGroup,
    pulledChanges,
  )
  const activeGroupId =
    groupStore.activeGroupId && groups.some((group) => group.id === groupStore.activeGroupId)
      ? groupStore.activeGroupId
      : (groups[0]?.id ?? null)
  const groupSnapshot = { groups, membersByGroup, activeGroupId }
  emitGroupSync(groupSnapshot)
  await persistGroupSyncSnapshot(groupStore, groupSnapshot)
  const metaById = new Map(
    (options.knowledgeMeta ?? [])
      .filter((item) => item.kind === 'sync')
      .map((item) => [item.id, item]),
  )
  let knowledgeMetaChanged = false
  if (includeKnowledge) {
    for (const change of pulledChanges) {
      if (change.entityKind !== 'knowledge_meta') continue
      knowledgeMetaChanged = true
      applyKnowledgeMetaChange(metaById, change)
    }
  }

  let snapshot: KnowledgeSnapshot | null = null
  let knowledgeError: string | undefined
  let knowledgeWanSkipped = false
  let knowledgeSince = syncState.knowledgeSince
  const previousSnapshot = includeKnowledge ? await loadKnowledgeSnapshot() : null
  const shouldExport =
    includeKnowledge && includeKnowledgeSnapshot && (knowledgeMetaChanged || !previousSnapshot)
  if (shouldExport && (transport === 'community-hub' || !client)) {
    // Community Hub / peer-only paths have no knowledge file/export APIs.
    snapshot = previousSnapshot
    knowledgeWanSkipped = true
    knowledgeError = KNOWLEDGE_WAN_SOFT_MESSAGE
  } else if (shouldExport && client) {
    try {
      const incoming = await client.exportKnowledgeSnapshot(
        previousSnapshot ? knowledgeSince : undefined,
      )
      snapshot = await hydrateOmittedFiles(
        client,
        mergeKnowledgeSnapshot(previousSnapshot, incoming),
      )
      await saveKnowledgeSnapshot(snapshot)
      knowledgeSince = snapshot.documents.reduce(
        (max, doc) => Math.max(max, doc.updatedAt),
        snapshot.exportedAt,
      )
      for (const kb of snapshot.kbs) {
        if (kb.kind !== 'sync' || isSystemDefaultFolderName(kb.name)) continue
        metaById.set(kb.id, {
          id: kb.id,
          name: kb.name,
          kind: kb.kind,
          documentCount: kb.documentCount,
          updatedAt: kb.updatedAt,
        })
      }
    } catch (error) {
      knowledgeError = error instanceof Error ? error.message : String(error)
    }
  } else {
    snapshot = previousSnapshot
  }

  const hostsOnline = client ? await countDesktopHostsOnline(client) : 0
  let nextState: MobileSyncState = {
    ...syncState,
    cursor: cursor ?? options.cursor,
    knowledgeSince,
    hubIdentityId: (await loadSyncIdentityId()) ?? syncState.hubIdentityId,
  }
  if (includeClassroom) nextState = stampClassroomCourses(nextState, classroomCourses)
  await saveMobileSyncState(nextState)

  return {
    notes: merged.notes,
    deletedNotes: merged.deletedNotes,
    knowledgeMeta: listedSyncKnowledgeItems(
      Array.from(metaById.values())
        .filter((item) => item.kind === 'sync')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    ),
    classroomCourses,
    groups,
    nextCursor: nextState.cursor,
    hostsOnline,
    snapshot,
    documentCount: snapshot?.documents.length ?? 0,
    knowledgeError,
    knowledgeWanSkipped,
    transport: effectiveTransport,
    baseUrl,
    syncState: nextState,
  }
}
