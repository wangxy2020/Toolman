import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pWorkspaces } from '../schema/p2p.js'
import type { P2pWorkspaceRow, P2pWorkspaceStatus } from '../types/p2p.js'

export interface CreateP2pWorkspaceInput {
  id?: string
  name: string
  ownerDeviceId: string
  ownerIdentityId: string
  workspaceKeyHash: string
  description?: string
  avatarHash?: string
  maxMembers?: number
  settingsJson?: string
}

export interface UpdateP2pWorkspaceInput {
  id: string
  name?: string
  description?: string | null
  avatarHash?: string | null
  maxMembers?: number
  status?: P2pWorkspaceStatus
  settingsJson?: string
  lastEventSeq?: number
  lastSnapshotSeq?: number
}

export class P2pWorkspaceRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string): P2pWorkspaceRow | null {
    const row = this.db.select().from(p2pWorkspaces).where(eq(p2pWorkspaces.id, id)).get()
    if (!row || row.deletedAt) return null
    return row
  }

  listByOwnerIdentity(ownerIdentityId: string): P2pWorkspaceRow[] {
    return this.db
      .select()
      .from(p2pWorkspaces)
      .where(
        and(
          eq(p2pWorkspaces.ownerIdentityId, ownerIdentityId),
          isNull(p2pWorkspaces.deletedAt),
        ),
      )
      .orderBy(desc(p2pWorkspaces.updatedAt))
      .all()
  }

  listActive(): P2pWorkspaceRow[] {
    return this.db
      .select()
      .from(p2pWorkspaces)
      .where(and(eq(p2pWorkspaces.status, 'active'), isNull(p2pWorkspaces.deletedAt)))
      .orderBy(desc(p2pWorkspaces.updatedAt))
      .all()
  }

  create(input: CreateP2pWorkspaceInput): P2pWorkspaceRow {
    const now = new Date()
    const id = input.id ?? randomUUID()

    this.db
      .insert(p2pWorkspaces)
      .values({
        id,
        name: input.name,
        ownerDeviceId: input.ownerDeviceId,
        ownerIdentityId: input.ownerIdentityId,
        workspaceKeyHash: input.workspaceKeyHash,
        description: input.description ?? null,
        avatarHash: input.avatarHash ?? null,
        maxMembers: input.maxMembers ?? 10,
        status: 'active',
        settingsJson: input.settingsJson ?? '{}',
        lastEventSeq: 0,
        lastSnapshotSeq: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.findById(id)!
  }

  update(input: UpdateP2pWorkspaceInput): P2pWorkspaceRow | null {
    const existing = this.findById(input.id)
    if (!existing) return null

    const now = new Date()
    this.db
      .update(p2pWorkspaces)
      .set({
        name: input.name ?? existing.name,
        description: input.description !== undefined ? input.description : existing.description,
        avatarHash: input.avatarHash !== undefined ? input.avatarHash : existing.avatarHash,
        maxMembers: input.maxMembers ?? existing.maxMembers,
        status: input.status ?? existing.status,
        settingsJson: input.settingsJson ?? existing.settingsJson,
        lastEventSeq: input.lastEventSeq ?? existing.lastEventSeq,
        lastSnapshotSeq: input.lastSnapshotSeq ?? existing.lastSnapshotSeq,
        updatedAt: now,
      })
      .where(eq(p2pWorkspaces.id, input.id))
      .run()

    return this.findById(input.id)
  }

  softDelete(id: string): boolean {
    const existing = this.findById(id)
    if (!existing) return false

    const now = new Date()
    this.db
      .update(p2pWorkspaces)
      .set({
        status: 'dissolved',
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(p2pWorkspaces.id, id))
      .run()

    return true
  }
}

export function hashWorkspaceKey(workspaceKey: string): string {
  return createHash('sha256').update(workspaceKey).digest('hex')
}
