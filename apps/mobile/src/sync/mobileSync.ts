import { ToolmanSyncClient } from '@toolman/sync-client'
import {
  bytesToBase64,
  DEFAULT_LOCAL_SYNC_BASE_URL,
  DEFAULT_LOCAL_SYNC_IDENTITY_ID,
  isSyncHubHealthPayload,
  KNOWLEDGE_SNAPSHOT_DOWNLOAD_FILE_MAX_BYTES,
  listSyncBaseUrlCandidates,
  mergeKnowledgeSnapshot,
  type KnowledgeSnapshot,
  type SyncChange,
} from '@toolman/shared'
import { getOrCreateDeviceId, loadIdentity } from '../storage/secure'
import { type MobileNote, type NoteTombstone } from '../storage/notes'
import { loadKnowledgeSnapshot, saveKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import {
  loadMobileSyncState,
  saveMobileSyncState,
  type MobileSyncState,
} from './syncState'
import { applyNotePushStamps, selectDirtyNoteChanges } from './notePushDelta'
import {
  applyClassroomPushStamps,
  selectDirtyClassroomChanges,
  stampClassroomCourses,
} from './classroomPushDelta'
import { isSystemDefaultFolderName, listedSyncKnowledgeItems } from '../features/knowledgeSidebar'
import { mergeNotesFromSyncChanges } from './noteSyncMerge'
import {
  mergeClassroomCoursesFromSyncChanges,
  type MobileClassroomCourse,
} from './classroomSyncMerge'
import { resolveCommunityHubBaseUrl } from '../settings/communityHubUrl'
import { loadModulePrefs } from '../settings/prefs'
import { listDesktopDevHostnames, shouldProbeLoopbackSyncHub } from './desktopDevHost'

let cachedSyncBaseUrl: string | null = null

export type KnowledgeMetaItem = {
  id: string
  name: string
  kind: string
  documentCount: number
  updatedAt: number
}

/** Bind fetch to the global object — Expo Web throws Illegal invocation on unbound Window.fetch. */
const boundFetch: typeof fetch = (input, init) => globalThis.fetch.call(globalThis, input, init)

async function loadSyncIdentityId(): Promise<string> {
  return (await loadIdentity())?.identityId ?? DEFAULT_LOCAL_SYNC_IDENTITY_ID
}

export async function loadSyncHubToken(): Promise<string | null> {
  const fromEnv = process.env.EXPO_PUBLIC_SYNC_TOKEN?.trim()
  if (fromEnv) return fromEnv
  const prefs = await loadModulePrefs()
  const token = prefs.sync?.hubToken?.trim()
  return token || null
}

export function createMobileSyncClient(baseUrl?: string): ToolmanSyncClient {
  return new ToolmanSyncClient({
    baseUrl: baseUrl ?? cachedSyncBaseUrl ?? DEFAULT_LOCAL_SYNC_BASE_URL,
    getAccessToken: loadSyncHubToken,
    getSyncToken: loadSyncHubToken,
    getIdentityId: loadSyncIdentityId,
    fetchImpl: boundFetch,
  })
}

async function probeJson(
  url: string,
  signal: AbortSignal,
): Promise<unknown | null> {
  const res = await boundFetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Accept only the desktop Sync Hub — never Community Hub catalog (`:3721`). */
async function probeSyncBaseUrl(baseUrl: string): Promise<boolean> {
  const origin = baseUrl.replace(/\/+$/, '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  try {
    const health = await probeJson(`${origin}/health`, ctrl.signal)
    return isSyncHubHealthPayload(health)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function resetMobileSyncBaseUrlCache(): void {
  cachedSyncBaseUrl = null
}

function unreachableSyncHubMessage(tried: string[]): string {
  const list = tried.length > 0 ? tried.join('、') : DEFAULT_LOCAL_SYNC_BASE_URL
  return (
    `无法连接桌面 Sync Hub（${list}）。` +
    '请在桌面端开启「与移动端同步」或课堂「同步设置」后完全重启桌面端；' +
    '真机请在设置 → 用户信息填写电脑的局域网 / Tailscale 地址（端口 17890）。'
  )
}

export async function resolveReachableMobileSyncBaseUrl(
  communityHubBaseUrl?: string | null,
): Promise<string> {
  const prefs = await loadModulePrefs()
  const configuredCommunity =
    communityHubBaseUrl === undefined ? prefs.community.hubBaseUrl : communityHubBaseUrl
  const packagerHostnames = listDesktopDevHostnames()
  const candidates = listSyncBaseUrlCandidates({
    configuredSyncBaseUrl: prefs.sync?.hubBaseUrl,
    envSyncBaseUrl: process.env.EXPO_PUBLIC_SYNC_BASE_URL,
    communityHubBaseUrl: resolveCommunityHubBaseUrl(configuredCommunity),
    packagerHostnames,
    includeLoopback: shouldProbeLoopbackSyncHub(packagerHostnames),
  })
  if (
    cachedSyncBaseUrl &&
    candidates.includes(cachedSyncBaseUrl) &&
    (await probeSyncBaseUrl(cachedSyncBaseUrl))
  ) {
    return cachedSyncBaseUrl
  }
  for (const url of candidates) {
    if (await probeSyncBaseUrl(url)) {
      cachedSyncBaseUrl = url
      return url
    }
  }
  throw new Error(unreachableSyncHubMessage(candidates))
}

export async function createReachableMobileSyncClient(
  communityHubBaseUrl?: string | null,
): Promise<ToolmanSyncClient> {
  return createMobileSyncClient(await resolveReachableMobileSyncBaseUrl(communityHubBaseUrl))
}

export function getMobileSyncBaseUrl(): string {
  return (
    cachedSyncBaseUrl ??
    (process.env.EXPO_PUBLIC_SYNC_BASE_URL?.trim() || DEFAULT_LOCAL_SYNC_BASE_URL)
  )
}

/** Live probe of desktop agent hosts (does not depend on prior sync state). */
export async function countDesktopHostsOnline(
  client?: ToolmanSyncClient,
): Promise<number> {
  try {
    const syncClient = client ?? (await createReachableMobileSyncClient())
    const hosts = await syncClient.listHosts()
    return hosts.filter((h) => h.agentHost && h.deviceKind === 'desktop').length
  } catch {
    return 0
  }
}

export type AppliedSync = {
  notes: MobileNote[]
  deletedNotes: NoteTombstone[]
  knowledgeMeta: KnowledgeMetaItem[]
  classroomCourses: MobileClassroomCourse[]
  nextCursor: string | null
  hostsOnline: number
  snapshot: KnowledgeSnapshot | null
  documentCount: number
  knowledgeError?: string
  syncState: MobileSyncState
}

async function hydrateOmittedFiles(
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

export const AUTO_SYNC_PAGE_MODULES: ReadonlySet<string> = new Set([
  'notes',
  'knowledge',
  'classroom',
])

export const AUTO_SYNC_INTERVAL_MS = 180_000
export const AUTO_SYNC_MIN_GAP_MS = 30_000

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
  const client = options.client ?? (await createReachableMobileSyncClient())
  const deviceId = await getOrCreateDeviceId()
  const syncState = options.syncState ?? (await loadMobileSyncState())

  const pulledChanges: SyncChange[] = []
  let cursor = options.cursor
  for (let page = 0; page < 50; page += 1) {
    const pull = await client.pull({ deviceId, cursor, limit: 100 })
    pulledChanges.push(...pull.changes)
    const nextCursor = pull.nextCursor ?? cursor
    const hasMore = pull.hasMore === true || pull.changes.length >= 100
    cursor = nextCursor
    if (!hasMore || pull.changes.length === 0) break
  }

  const merged = includeNotes
    ? mergeNotesFromSyncChanges(
        options.notes,
        options.deletedNotes ?? [],
        pulledChanges,
      )
    : { notes: options.notes, deletedNotes: options.deletedNotes ?? [] }
  const classroomCourses = includeClassroom
    ? mergeClassroomCoursesFromSyncChanges(
        options.classroomCourses ?? [],
        pulledChanges,
      )
    : (options.classroomCourses ?? [])
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
  let knowledgeSince = syncState.knowledgeSince
  const previousSnapshot = includeKnowledge ? await loadKnowledgeSnapshot() : null
  const shouldExport =
    includeKnowledge &&
    includeKnowledgeSnapshot &&
    (knowledgeMetaChanged || !previousSnapshot)
  if (shouldExport) {
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
    nextCursor: nextState.cursor,
    hostsOnline,
    snapshot,
    documentCount: snapshot?.documents.length ?? 0,
    knowledgeError,
    syncState: nextState,
  }
}

export { applyNotePushStamps, selectDirtyNoteChanges } from './notePushDelta'
export {
  applyClassroomPushStamps,
  selectDirtyClassroomChanges,
  stampClassroomCourses,
} from './classroomPushDelta'
export { classifySyncFailure, formatSyncFailureMessage } from './syncFailure'

export async function pushNoteChanges(
  notes: MobileNote[],
  cursor: string | null,
  extras?: {
    client?: ToolmanSyncClient
    deletedNotes?: NoteTombstone[]
    syncState?: MobileSyncState
  },
): Promise<MobileSyncState> {
  const client = extras?.client ?? (await createReachableMobileSyncClient())
  const deviceId = await getOrCreateDeviceId()
  const syncState = extras?.syncState ?? (await loadMobileSyncState())
  const deletedNotes = extras?.deletedNotes ?? []
  const changes = selectDirtyNoteChanges(notes, deletedNotes, syncState)
  if (changes.length === 0) return syncState
  await client.push({ deviceId, cursor, changes })
  const next = applyNotePushStamps(syncState, notes, deletedNotes, changes)
  await saveMobileSyncState(next)
  return next
}

export async function pushClassroomChanges(
  courses: MobileClassroomCourse[],
  cursor: string | null,
  extras?: { client?: ToolmanSyncClient; syncState?: MobileSyncState },
): Promise<MobileSyncState> {
  const client = extras?.client ?? (await createReachableMobileSyncClient())
  const deviceId = await getOrCreateDeviceId()
  const syncState = extras?.syncState ?? (await loadMobileSyncState())
  const changes = selectDirtyClassroomChanges(courses, syncState)
  if (changes.length === 0) return syncState
  await client.push({ deviceId, cursor, changes })
  const next = applyClassroomPushStamps(syncState, courses, changes)
  await saveMobileSyncState(next)
  return next
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
