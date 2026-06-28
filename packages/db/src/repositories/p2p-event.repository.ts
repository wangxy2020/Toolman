import { createHash, randomUUID } from 'node:crypto'
import { and, count, desc, eq, gt, lt } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pEvents, p2pWorkspaces } from '../schema/p2p.js'
import type { P2pEventRow, P2pEventType, P2pResourceType } from '../types/p2p.js'

export interface InsertP2pEventInput {
  id: string
  workspaceId: string
  seq: number
  resourceType: P2pResourceType
  resourceId: string
  operatorId: string
  eventType: P2pEventType
  payload: Record<string, unknown>
  prevEventHash?: string | null
  sourceDeviceId: string
  timestamp?: Date
  synced?: boolean
}

export interface AppendP2pEventInput {
  workspaceId: string
  resourceType: P2pResourceType
  resourceId: string
  operatorId: string
  eventType: P2pEventType
  payload: Record<string, unknown>
  sourceDeviceId: string
  timestamp?: Date
  prevEventHash?: string | null
  synced?: boolean
}

export interface ListP2pEventsOptions {
  workspaceId: string
  sinceSeq?: number
  resourceType?: P2pResourceType
  resourceId?: string
  limit?: number
  offset?: number
}

export class P2pEventRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string): P2pEventRow | null {
    return this.db.select().from(p2pEvents).where(eq(p2pEvents.id, id)).get() ?? null
  }

  findByWorkspaceSeq(workspaceId: string, seq: number): P2pEventRow | null {
    return (
      this.db
        .select()
        .from(p2pEvents)
        .where(and(eq(p2pEvents.workspaceId, workspaceId), eq(p2pEvents.seq, seq)))
        .get() ?? null
    )
  }

  getLatestSeq(workspaceId: string): number {
    const row = this.db
      .select({ seq: p2pEvents.seq })
      .from(p2pEvents)
      .where(eq(p2pEvents.workspaceId, workspaceId))
      .orderBy(desc(p2pEvents.seq))
      .limit(1)
      .get()

    return row?.seq ?? 0
  }

  findLatestByOperatorId(workspaceId: string, operatorId: string): P2pEventRow | null {
    return (
      this.db
        .select()
        .from(p2pEvents)
        .where(and(eq(p2pEvents.workspaceId, workspaceId), eq(p2pEvents.operatorId, operatorId)))
        .orderBy(desc(p2pEvents.seq))
        .limit(1)
        .get() ?? null
    )
  }

  list(options: ListP2pEventsOptions & { order?: 'asc' | 'desc' }): P2pEventRow[] {
    const conditions = [eq(p2pEvents.workspaceId, options.workspaceId)]

    if (options.sinceSeq !== undefined) {
      conditions.push(gt(p2pEvents.seq, options.sinceSeq))
    }
    if (options.resourceType) {
      conditions.push(eq(p2pEvents.resourceType, options.resourceType))
    }
    if (options.resourceId) {
      conditions.push(eq(p2pEvents.resourceId, options.resourceId))
    }

    const orderBy = options.order === 'desc' ? desc(p2pEvents.seq) : p2pEvents.seq

    let query = this.db
      .select()
      .from(p2pEvents)
      .where(and(...conditions))
      .orderBy(orderBy)

    if (options.limit !== undefined) {
      query = query.limit(options.limit) as typeof query
    }
    if (options.offset !== undefined) {
      query = query.offset(options.offset) as typeof query
    }

    return query.all()
  }

  count(options: Omit<ListP2pEventsOptions, 'limit' | 'offset'>): number {
    const conditions = [eq(p2pEvents.workspaceId, options.workspaceId)]

    if (options.sinceSeq !== undefined) {
      conditions.push(gt(p2pEvents.seq, options.sinceSeq))
    }
    if (options.resourceType) {
      conditions.push(eq(p2pEvents.resourceType, options.resourceType))
    }
    if (options.resourceId) {
      conditions.push(eq(p2pEvents.resourceId, options.resourceId))
    }

    const row = this.db
      .select({ total: count() })
      .from(p2pEvents)
      .where(and(...conditions))
      .get()

    return row?.total ?? 0
  }

  insert(input: InsertP2pEventInput): P2pEventRow {
    const now = new Date()
    const payloadJson = JSON.stringify(input.payload)
    const payloadHash = createHash('sha256').update(payloadJson).digest('hex')
    const timestamp = input.timestamp ?? now

    return this.db.transaction((tx) => {
      tx.insert(p2pEvents)
        .values({
          id: input.id,
          workspaceId: input.workspaceId,
          seq: input.seq,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          operatorId: input.operatorId,
          eventType: input.eventType,
          payloadJson,
          payloadHash,
          prevEventHash: input.prevEventHash ?? null,
          timestamp,
          sourceDeviceId: input.sourceDeviceId,
          synced: input.synced ?? false,
          createdAt: now,
        })
        .run()

      tx.update(p2pWorkspaces)
        .set({
          lastEventSeq: input.seq,
          updatedAt: now,
        })
        .where(eq(p2pWorkspaces.id, input.workspaceId))
        .run()

      return tx.select().from(p2pEvents).where(eq(p2pEvents.id, input.id)).get()!
    })
  }

  append(input: AppendP2pEventInput): P2pEventRow {
    const now = new Date()
    const eventId = randomUUID()
    const payloadJson = JSON.stringify(input.payload)
    const payloadHash = createHash('sha256').update(payloadJson).digest('hex')
    const timestamp = input.timestamp ?? now

    return this.db.transaction((tx) => {
      const latest = tx
        .select({ seq: p2pEvents.seq })
        .from(p2pEvents)
        .where(eq(p2pEvents.workspaceId, input.workspaceId))
        .orderBy(desc(p2pEvents.seq))
        .limit(1)
        .get()

      const seq = (latest?.seq ?? 0) + 1

      tx.insert(p2pEvents)
        .values({
          id: eventId,
          workspaceId: input.workspaceId,
          seq,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          operatorId: input.operatorId,
          eventType: input.eventType,
          payloadJson,
          payloadHash,
          prevEventHash: input.prevEventHash ?? null,
          timestamp,
          sourceDeviceId: input.sourceDeviceId,
          synced: input.synced ?? false,
          createdAt: now,
        })
        .run()

      tx.update(p2pWorkspaces)
        .set({
          lastEventSeq: seq,
          updatedAt: now,
        })
        .where(eq(p2pWorkspaces.id, input.workspaceId))
        .run()

      return tx.select().from(p2pEvents).where(eq(p2pEvents.id, eventId)).get()!
    })
  }

  markSynced(id: string): P2pEventRow | null {
    const existing = this.findById(id)
    if (!existing) return null

    this.db.update(p2pEvents).set({ synced: true }).where(eq(p2pEvents.id, id)).run()
    return this.findById(id)
  }

  deleteById(id: string): boolean {
    const existing = this.findById(id)
    if (!existing) return false
    this.db.delete(p2pEvents).where(eq(p2pEvents.id, id)).run()
    return true
  }

  replaceConflictingEvent(existingId: string, input: InsertP2pEventInput): P2pEventRow {
    const now = new Date()
    const payloadJson = JSON.stringify(input.payload)
    const payloadHash = createHash('sha256').update(payloadJson).digest('hex')
    const timestamp = input.timestamp ?? now

    return this.db.transaction((tx) => {
      tx.delete(p2pEvents).where(eq(p2pEvents.id, existingId)).run()

      tx.insert(p2pEvents)
        .values({
          id: input.id,
          workspaceId: input.workspaceId,
          seq: input.seq,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          operatorId: input.operatorId,
          eventType: input.eventType,
          payloadJson,
          payloadHash,
          prevEventHash: input.prevEventHash ?? null,
          timestamp,
          sourceDeviceId: input.sourceDeviceId,
          synced: input.synced ?? false,
          createdAt: now,
        })
        .run()

      tx.update(p2pWorkspaces)
        .set({
          lastEventSeq: input.seq,
          updatedAt: now,
        })
        .where(eq(p2pWorkspaces.id, input.workspaceId))
        .run()

      return tx.select().from(p2pEvents).where(eq(p2pEvents.id, input.id)).get()!
    })
  }

  deleteEventsBeforeSeq(workspaceId: string, beforeSeq: number): number {
    const result = this.db
      .delete(p2pEvents)
      .where(and(eq(p2pEvents.workspaceId, workspaceId), lt(p2pEvents.seq, beforeSeq)))
      .run()
    return result.changes
  }
}

export function hashEventPayload(payloadJson: string): string {
  return createHash('sha256').update(payloadJson).digest('hex')
}
