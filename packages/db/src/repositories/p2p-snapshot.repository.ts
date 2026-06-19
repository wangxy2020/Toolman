import { randomUUID } from 'node:crypto'
import { and, desc, eq, lt } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pSnapshots } from '../schema/p2p.js'
import type { P2pSnapshotRow } from '../types/p2p.js'

export interface CreateP2pSnapshotInput {
  workspaceId: string
  snapshotSeq: number
  stateJson: string
  stateCompressed?: Buffer | null
  stateHash: string
  createdBy: string
  createdAt?: Date
}

export class P2pSnapshotRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string): P2pSnapshotRow | null {
    return this.db.select().from(p2pSnapshots).where(eq(p2pSnapshots.id, id)).get() ?? null
  }

  findLatest(workspaceId: string): P2pSnapshotRow | null {
    return (
      this.db
        .select()
        .from(p2pSnapshots)
        .where(eq(p2pSnapshots.workspaceId, workspaceId))
        .orderBy(desc(p2pSnapshots.snapshotSeq))
        .limit(1)
        .get() ?? null
    )
  }

  findByWorkspaceSeq(workspaceId: string, snapshotSeq: number): P2pSnapshotRow | null {
    return (
      this.db
        .select()
        .from(p2pSnapshots)
        .where(
          and(
            eq(p2pSnapshots.workspaceId, workspaceId),
            eq(p2pSnapshots.snapshotSeq, snapshotSeq),
          ),
        )
        .get() ?? null
    )
  }

  listByWorkspace(workspaceId: string): P2pSnapshotRow[] {
    return this.db
      .select()
      .from(p2pSnapshots)
      .where(eq(p2pSnapshots.workspaceId, workspaceId))
      .orderBy(desc(p2pSnapshots.snapshotSeq))
      .all()
  }

  create(input: CreateP2pSnapshotInput): P2pSnapshotRow {
    const id = randomUUID()
    const createdAt = input.createdAt ?? new Date()
    this.db
      .insert(p2pSnapshots)
      .values({
        id,
        workspaceId: input.workspaceId,
        snapshotSeq: input.snapshotSeq,
        stateJson: input.stateJson,
        stateCompressed: input.stateCompressed ?? null,
        stateHash: input.stateHash,
        createdBy: input.createdBy,
        createdAt,
      })
      .run()
    return this.findById(id)!
  }

  deleteOlderThan(workspaceId: string, keepCount: number): number {
    const rows = this.listByWorkspace(workspaceId)
    if (rows.length <= keepCount) return 0

    const toDelete = rows.slice(keepCount)
    let deleted = 0
    for (const row of toDelete) {
      this.db.delete(p2pSnapshots).where(eq(p2pSnapshots.id, row.id)).run()
      deleted += 1
    }
    return deleted
  }

  deleteBeforeSeq(workspaceId: string, snapshotSeq: number): number {
    const rows = this.db
      .select()
      .from(p2pSnapshots)
      .where(
        and(eq(p2pSnapshots.workspaceId, workspaceId), lt(p2pSnapshots.snapshotSeq, snapshotSeq)),
      )
      .all()
    for (const row of rows) {
      this.db.delete(p2pSnapshots).where(eq(p2pSnapshots.id, row.id)).run()
    }
    return rows.length
  }
}
