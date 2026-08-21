/**
 * Desktop ↔ mobile classroom course sync (changelog entityKind: classroom_session).
 */
import { and, eq, isNull } from 'drizzle-orm'
import {
  ASSISTANT_LIB_SESSION_METADATA_KEY,
  ClassroomSessionSyncPayloadSchema,
  isAssistantLibAssistantName,
  isAssistantLibGuideCourseSession,
  isAssistantLibSession,
  parseAssistantLibSessionMeta,
  parseSocraticState,
  type ClassroomSessionSyncPayload,
  type Session,
  type SyncChange,
} from '@toolman/shared'
import { assistants, sessions } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'
import { toIpcSession } from '../mappers/chat'
import { isClassroomSyncPreferenceEnabled } from './mobile-sync.config'
import { isMobileSyncEnabled } from './mobile-sync.service'
import { appendSyncChanges } from './mobile-sync-store'
import { logStructured } from './structured-log.service'

let applyingInbound = false

export function isClassroomSyncEnabled(): boolean {
  return isClassroomSyncPreferenceEnabled() && isMobileSyncEnabled()
}

function toPayload(session: Session): ClassroomSessionSyncPayload | null {
  const meta = parseAssistantLibSessionMeta(session.metadata)
  if (!meta) return null
  const parsed = ClassroomSessionSyncPayloadSchema.safeParse({
    title: session.title || meta.courseName || '未命名课程',
    meta,
    socraticState: parseSocraticState(session.metadata),
  })
  return parsed.success ? parsed.data : null
}

export function publishClassroomSessionSyncChange(session: Session): void {
  if (applyingInbound || !isClassroomSyncEnabled()) return
  const payload = toPayload(session)
  if (!payload) return
  appendSyncChanges([
    {
      entityKind: 'classroom_session',
      entityId: session.id,
      op: 'upsert',
      updatedAt: session.updatedAt,
      payload,
    },
  ])
}

export function publishClassroomSessionDeleteSyncChange(
  sessionId: string,
  updatedAt = Date.now(),
): void {
  if (applyingInbound || !isClassroomSyncEnabled()) return
  appendSyncChanges([
    {
      entityKind: 'classroom_session',
      entityId: sessionId,
      op: 'delete',
      updatedAt,
      payload: {},
    },
  ])
}

export function seedClassroomSessionSyncChanges(): number {
  if (!isClassroomSyncEnabled()) return 0
  const db = getDatabase()
  const rows = db.select().from(sessions).where(isNull(sessions.deletedAt)).all()
  let published = 0
  for (const row of rows) {
    try {
      const session = toIpcSession(row)
      if (!isAssistantLibSession(session.metadata)) continue
      const payload = toPayload(session)
      if (!payload) continue
      appendSyncChanges([
        {
          entityKind: 'classroom_session',
          entityId: session.id,
          op: 'upsert',
          updatedAt: session.updatedAt,
          payload,
        },
      ])
      published += 1
    } catch (error) {
      logStructured(
        'mobile-sync',
        'warn',
        `classroom seed skipped ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return published
}

function resolveClassroomAnchor(): { workspaceId: string; assistantId: string | null } | null {
  const db = getDatabase()
  const assistantRows = db
    .select()
    .from(assistants)
    .where(isNull(assistants.deletedAt))
    .all()
  const classroom = assistantRows.find((row: { id: string; name: string; workspaceId: string }) =>
    isAssistantLibAssistantName(row.name),
  )
  if (classroom) {
    return { workspaceId: classroom.workspaceId, assistantId: classroom.id }
  }
  const sessionRows = db.select().from(sessions).where(isNull(sessions.deletedAt)).all()
  for (const row of sessionRows) {
    try {
      const session = toIpcSession(row)
      if (isAssistantLibSession(session.metadata)) {
        return { workspaceId: row.workspaceId, assistantId: row.assistantId }
      }
    } catch {
      // skip corrupt
    }
  }
  return null
}

function applyClassroomUpsert(change: SyncChange): boolean {
  const parsed = ClassroomSessionSyncPayloadSchema.safeParse(change.payload ?? {})
  if (!parsed.success) return false
  const payload = parsed.data
  const db = getDatabase()
  const existing = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, change.entityId), isNull(sessions.deletedAt)))
    .get()

  const metadata = {
    [ASSISTANT_LIB_SESSION_METADATA_KEY]: payload.meta,
    ...(payload.socraticState ? { socraticState: payload.socraticState } : {}),
  }
  const now = new Date()

  if (existing) {
    if (existing.updatedAt.getTime() > change.updatedAt) return false
    const previous = JSON.parse(existing.metadataJson) as Record<string, unknown>
    db.update(sessions)
      .set({
        title: payload.title,
        metadataJson: JSON.stringify({ ...previous, ...metadata }),
        updatedAt: new Date(change.updatedAt),
      })
      .where(eq(sessions.id, change.entityId))
      .run()
    return true
  }

  const anchor = resolveClassroomAnchor()
  if (!anchor) {
    logStructured('mobile-sync', 'warn', 'classroom inbound create skipped: no classroom assistant')
    return false
  }

  db.insert(sessions)
    .values({
      id: change.entityId,
      workspaceId: anchor.workspaceId,
      assistantId: anchor.assistantId,
      title: payload.title,
      type: 'chat',
      metadataJson: JSON.stringify(metadata),
      messageCount: 0,
      createdAt: now,
      updatedAt: new Date(change.updatedAt),
    })
    .run()
  return true
}

function parseSessionMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function markAssistantLibGuideDismissed(assistantId: string): void {
  const db = getDatabase()
  const row = db.select().from(assistants).where(eq(assistants.id, assistantId)).get()
  if (!row) return
  let params: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(row.parametersJson) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      params = parsed as Record<string, unknown>
    }
  } catch {
    params = {}
  }
  if (params.assistantLibGuideDismissed === true) return
  db.update(assistants)
    .set({
      parametersJson: JSON.stringify({ ...params, assistantLibGuideDismissed: true }),
      updatedAt: new Date(),
    })
    .where(eq(assistants.id, assistantId))
    .run()
}

export function applyClassroomSyncChanges(changes: SyncChange[]): boolean {
  let changed = false
  applyingInbound = true
  try {
    for (const change of changes) {
      if (change.entityKind !== 'classroom_session') continue
      if (change.op === 'delete') {
        const db = getDatabase()
        const existing = db.select().from(sessions).where(eq(sessions.id, change.entityId)).get()
        if (!existing || existing.deletedAt) continue
        if (existing.updatedAt.getTime() > change.updatedAt) continue
        const metadata = parseSessionMetadata(existing.metadataJson)
        if (!isAssistantLibSession(metadata)) {
          continue
        }
        if (isAssistantLibGuideCourseSession(metadata)) {
          markAssistantLibGuideDismissed(existing.assistantId)
        }
        db.update(sessions)
          .set({ deletedAt: new Date(), updatedAt: new Date(change.updatedAt) })
          .where(eq(sessions.id, change.entityId))
          .run()
        changed = true
        continue
      }
      if (applyClassroomUpsert(change)) changed = true
    }
  } finally {
    applyingInbound = false
  }
  return changed
}
