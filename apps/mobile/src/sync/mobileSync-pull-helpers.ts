import type { ToolmanSyncClient } from '@toolman/sync-client'
import {
  bytesToBase64,
  KNOWLEDGE_SNAPSHOT_DOWNLOAD_FILE_MAX_BYTES,
  type KnowledgeSnapshot,
  type SyncChange,
} from '@toolman/shared'
import { emptyNotesStore, saveNotesStore } from '../storage/notes'
import { saveClassroomCourses } from '../storage/classroomCourses'
import { saveCreatedKnowledgeBases } from '../storage/createdKnowledgeBases'
import { clearKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import {
  EMPTY_MOBILE_SYNC_STATE,
  saveMobileSyncState,
  type MobileSyncState,
} from './syncState'
import { LOCAL_ONLY_SYNC_HUB_ID } from './syncIdentity'
import { isSystemDefaultFolderName } from '../features/knowledgeSidebar'
import type { KnowledgeMetaItem } from './mobileSync-client'

export async function hydrateOmittedFiles(
  client: ToolmanSyncClient,
  snapshot: KnowledgeSnapshot,
): Promise<KnowledgeSnapshot> {
  const files = []
  for (const file of snapshot.files) {
    if (file.contentB64 || file.omitReason === 'missing') {
      files.push(file)
      continue
    }
    if (file.sizeBytes > KNOWLEDGE_SNAPSHOT_DOWNLOAD_FILE_MAX_BYTES) {
      files.push(file)
      continue
    }
    try {
      const bytes = await client.downloadKnowledgeFile(file.kbId, file.documentId)
      files.push({
        ...file,
        contentB64: bytesToBase64(bytes),
        sizeBytes: bytes.byteLength,
        omitted: false,
        omitReason: undefined,
      })
    } catch {
      files.push(file)
    }
  }
  return { ...snapshot, files }
}

export async function discardForeignPrivateWorkspace(_syncState: MobileSyncState): Promise<{
  notes: ReturnType<typeof emptyNotesStore>
  classroomCourses: []
  syncState: MobileSyncState
}> {
  const notes = emptyNotesStore()
  const nextState: MobileSyncState = {
    ...EMPTY_MOBILE_SYNC_STATE,
    hubIdentityId: LOCAL_ONLY_SYNC_HUB_ID,
  }
  // P2P groups, shared-agent proxy topics, and local chats live on this
  // device. A foreign Sync Hub probe must not wipe them.
  await Promise.all([
    saveNotesStore(notes),
    saveClassroomCourses([]),
    saveCreatedKnowledgeBases([]),
    clearKnowledgeSnapshot(),
    saveMobileSyncState(nextState),
  ])
  return { notes, classroomCourses: [], syncState: nextState }
}

export function applyKnowledgeMetaChange(
  byId: Map<string, KnowledgeMetaItem>,
  change: SyncChange,
): void {
  if (change.entityKind !== 'knowledge_meta') return
  if (change.op === 'delete') {
    byId.delete(change.entityId)
    return
  }
  const existing = byId.get(change.entityId)
  if (existing && existing.updatedAt > change.updatedAt) return
  const name =
    typeof change.payload?.name === 'string' ? change.payload.name : existing?.name ?? '未命名知识库'
  const kind =
    typeof change.payload?.kind === 'string' ? change.payload.kind : existing?.kind ?? 'local'
  // Mobile only keeps extra desktop「同步知识库」entries — 默认文件夹 is the virtual row.
  if (kind !== 'sync' || isSystemDefaultFolderName(name)) {
    byId.delete(change.entityId)
    return
  }
  const documentCount =
    typeof change.payload?.documentCount === 'number'
      ? change.payload.documentCount
      : existing?.documentCount ?? 0
  byId.set(change.entityId, {
    id: change.entityId,
    name,
    kind,
    documentCount,
    updatedAt: change.updatedAt,
  })
}
