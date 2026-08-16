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
  loadSyncIdentityId,
  type KnowledgeMetaItem,
  type MobileSyncTransport,
} from './mobileSync-client'
import {
  applyKnowledgeMetaChange,
  hydrateOmittedFiles,
} from './mobileSync-pull-helpers'

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
  '知识库文件需同局域网或稍后在 LAN 补拉（跨网仅同步目录元数据）'

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
  const client = options.client ?? (await createReachableMobileSyncClient())
  const baseUrl = client.getBaseUrl()
  const transport = classifyMobileSyncTransport(baseUrl)
  const deviceId = await getOrCreateDeviceId()

  const pulledChanges: SyncChange[] = []
  let cursor = options.cursor
  for (let page = 0; page < 50; page += 1) {
    let pull
    try {
      pull = await client.pull({ deviceId, cursor, limit: 100 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/403|identity mismatch/i.test(message)) throw error
      throw new Error('sync identity mismatch')
    }
    pulledChanges.push(...pull.changes)
    const nextCursor = pull.nextCursor ?? cursor
    const hasMore = pull.hasMore === true || pull.changes.length >= 100
    cursor = nextCursor
    if (!hasMore || pull.changes.length === 0) break
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
  if (shouldExport && transport === 'community-hub') {
    // Community Hub has no knowledge file/export APIs — keep meta, soft-degrade files.
    snapshot = previousSnapshot
    knowledgeWanSkipped = true
    knowledgeError = KNOWLEDGE_WAN_SOFT_MESSAGE
  } else if (shouldExport) {
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

  const hostsOnline = await countDesktopHostsOnline(client)
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
    transport,
    baseUrl,
    syncState: nextState,
  }
}
