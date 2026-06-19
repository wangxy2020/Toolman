import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pSyncCursors } from '../schema/p2p.js'
import type { P2pSyncCursorRow } from '../types/p2p.js'

export class P2pSyncCursorRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findByWorkspaceAndPeer(
    workspaceId: string,
    peerDeviceId: string,
  ): P2pSyncCursorRow | null {
    return (
      this.db
        .select()
        .from(p2pSyncCursors)
        .where(
          and(
            eq(p2pSyncCursors.workspaceId, workspaceId),
            eq(p2pSyncCursors.peerDeviceId, peerDeviceId),
          ),
        )
        .get() ?? null
    )
  }

  listByWorkspace(workspaceId: string): P2pSyncCursorRow[] {
    return this.db
      .select()
      .from(p2pSyncCursors)
      .where(eq(p2pSyncCursors.workspaceId, workspaceId))
      .all()
  }

  upsert(input: {
    workspaceId: string
    peerDeviceId: string
    lastSentSeq?: number
    lastReceivedSeq?: number
    lastSyncAt?: Date
  }): P2pSyncCursorRow {
    const now = new Date()
    const existing = this.findByWorkspaceAndPeer(input.workspaceId, input.peerDeviceId)

    if (existing) {
      this.db
        .update(p2pSyncCursors)
        .set({
          lastSentSeq: input.lastSentSeq ?? existing.lastSentSeq,
          lastReceivedSeq: input.lastReceivedSeq ?? existing.lastReceivedSeq,
          lastSyncAt: input.lastSyncAt ?? existing.lastSyncAt,
          updatedAt: now,
        })
        .where(eq(p2pSyncCursors.id, existing.id))
        .run()
      return this.findByWorkspaceAndPeer(input.workspaceId, input.peerDeviceId)!
    }

    const id = randomUUID()
    this.db
      .insert(p2pSyncCursors)
      .values({
        id,
        workspaceId: input.workspaceId,
        peerDeviceId: input.peerDeviceId,
        lastSentSeq: input.lastSentSeq ?? 0,
        lastReceivedSeq: input.lastReceivedSeq ?? 0,
        lastSyncAt: input.lastSyncAt ?? null,
        updatedAt: now,
      })
      .run()

    return this.findByWorkspaceAndPeer(input.workspaceId, input.peerDeviceId)!
  }

  updateSentSeq(workspaceId: string, peerDeviceId: string, seq: number): P2pSyncCursorRow {
    const existing = this.findByWorkspaceAndPeer(workspaceId, peerDeviceId)
    const current = existing?.lastSentSeq ?? 0
    return this.upsert({
      workspaceId,
      peerDeviceId,
      lastSentSeq: Math.max(current, seq),
      lastSyncAt: new Date(),
    })
  }

  updateReceivedSeq(workspaceId: string, peerDeviceId: string, seq: number): P2pSyncCursorRow {
    const existing = this.findByWorkspaceAndPeer(workspaceId, peerDeviceId)
    const current = existing?.lastReceivedSeq ?? 0
    return this.upsert({
      workspaceId,
      peerDeviceId,
      lastReceivedSeq: Math.max(current, seq),
      lastSyncAt: new Date(),
    })
  }
}
