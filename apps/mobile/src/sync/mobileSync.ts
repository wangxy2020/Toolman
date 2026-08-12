import { ToolmanSyncClient } from '@toolman/sync-client'
import type { SyncChange } from '@toolman/shared'
import { getOrCreateDeviceId, loadAccessToken } from '../storage/secure'
import { DEFAULT_NOTEBOOK_ID, type MobileNote } from '../storage/notes'

/** Local desktop Sync Hub by default; override with EXPO_PUBLIC_SYNC_BASE_URL for cloud. */
const DEFAULT_SYNC_BASE =
  process.env.EXPO_PUBLIC_SYNC_BASE_URL?.trim() || 'http://127.0.0.1:17890'

export type KnowledgeMetaItem = {
  id: string
  name: string
  kind: string
  documentCount: number
  updatedAt: number
}

export function createMobileSyncClient(baseUrl = DEFAULT_SYNC_BASE): ToolmanSyncClient {
  return new ToolmanSyncClient({
    baseUrl,
    getAccessToken: loadAccessToken,
  })
}

export function getMobileSyncBaseUrl(): string {
  return DEFAULT_SYNC_BASE
}

/** Live probe of desktop agent hosts (does not depend on prior sync state). */
export async function countDesktopHostsOnline(
  client = createMobileSyncClient(),
): Promise<number> {
  try {
    const hosts = await client.listHosts()
    return hosts.filter((h) => h.agentHost && h.deviceKind === 'desktop').length
  } catch {
    return 0
  }
}

export type AppliedSync = {
  notes: MobileNote[]
  knowledgeMeta: KnowledgeMetaItem[]
  nextCursor: string | null
  hostsOnline: number
}

/** Pull remote changes and merge notes + knowledge metadata (LWW). */
export async function pullAndApplySync(options: {
  client?: ToolmanSyncClient
  cursor: string | null
  notes: MobileNote[]
  knowledgeMeta?: KnowledgeMetaItem[]
}): Promise<AppliedSync> {
  const client = options.client ?? createMobileSyncClient()
  const deviceId = await getOrCreateDeviceId()

  let pull: { changes: SyncChange[]; nextCursor: string | null } | null = null
  try {
    pull = await client.pull({ deviceId, cursor: options.cursor, limit: 100 })
  } catch {
    pull = null
  }

  const byId = new Map(options.notes.map((n) => [n.id, n]))
  const metaById = new Map((options.knowledgeMeta ?? []).map((item) => [item.id, item]))
  if (pull) {
    for (const change of pull.changes) {
      applyNoteChange(byId, change)
      applyKnowledgeMetaChange(metaById, change)
    }
  }

  const hostsOnline = await countDesktopHostsOnline(client)

  return {
    notes: Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt),
    knowledgeMeta: Array.from(metaById.values()).sort((a, b) => b.updatedAt - a.updatedAt),
    nextCursor: pull?.nextCursor ?? options.cursor,
    hostsOnline,
  }
}

export async function pushNoteChanges(
  notes: MobileNote[],
  cursor: string | null,
  client = createMobileSyncClient(),
): Promise<void> {
  const deviceId = await getOrCreateDeviceId()
  const changes: SyncChange[] = notes.map((note) => ({
    entityKind: 'note',
    entityId: note.id,
    op: 'upsert',
    updatedAt: note.updatedAt,
    payload: { title: note.title, body: note.body, notebookId: note.notebookId },
  }))
  if (changes.length === 0) return
  await client.push({ deviceId, cursor, changes })
}

function applyNoteChange(byId: Map<string, MobileNote>, change: SyncChange): void {
  if (change.entityKind !== 'note') return
  if (change.op === 'delete') {
    byId.delete(change.entityId)
    return
  }
  const existing = byId.get(change.entityId)
  if (existing && existing.updatedAt > change.updatedAt) return
  const title =
    typeof change.payload?.title === 'string' ? change.payload.title : existing?.title ?? '未命名'
  const body =
    typeof change.payload?.body === 'string' ? change.payload.body : existing?.body ?? ''
  const notebookId =
    typeof change.payload?.notebookId === 'string'
      ? change.payload.notebookId
      : existing?.notebookId ?? DEFAULT_NOTEBOOK_ID
  byId.set(change.entityId, {
    id: change.entityId,
    notebookId,
    title,
    body,
    updatedAt: change.updatedAt,
  })
}

function applyKnowledgeMetaChange(
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
