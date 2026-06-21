import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pWorkspaceMembers } from '../schema/p2p.js'
import type { P2pMemberRole, P2pMemberStatus, P2pWorkspaceMemberRow } from '../types/p2p.js'

export interface CreateP2pMemberInput {
  id?: string
  workspaceId: string
  identityId: string
  deviceId: string
  displayName: string
  role: P2pMemberRole
  status?: P2pMemberStatus
  invitedBy?: string
  joinedAt?: Date
  certJson?: string
}

export interface UpdateP2pMemberInput {
  id: string
  displayName?: string
  role?: P2pMemberRole
  status?: P2pMemberStatus
  lastSeenAt?: Date
  certJson?: string
  joinedAt?: Date
}

export class P2pMemberRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string): P2pWorkspaceMemberRow | null {
    return this.db.select().from(p2pWorkspaceMembers).where(eq(p2pWorkspaceMembers.id, id)).get() ?? null
  }

  findByWorkspaceAndDevice(workspaceId: string, deviceId: string): P2pWorkspaceMemberRow | null {
    return (
      this.db
        .select()
        .from(p2pWorkspaceMembers)
        .where(
          and(
            eq(p2pWorkspaceMembers.workspaceId, workspaceId),
            eq(p2pWorkspaceMembers.deviceId, deviceId),
          ),
        )
        .get() ?? null
    )
  }

  listByWorkspace(workspaceId: string, status?: P2pMemberStatus): P2pWorkspaceMemberRow[] {
    const conditions = [eq(p2pWorkspaceMembers.workspaceId, workspaceId)]
    if (status) {
      conditions.push(eq(p2pWorkspaceMembers.status, status))
    }

    return this.db
      .select()
      .from(p2pWorkspaceMembers)
      .where(and(...conditions))
      .all()
  }

  countActiveByWorkspace(workspaceId: string): number {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(p2pWorkspaceMembers)
      .where(
        and(
          eq(p2pWorkspaceMembers.workspaceId, workspaceId),
          eq(p2pWorkspaceMembers.status, 'active'),
        ),
      )
      .get()
    return row?.count ?? 0
  }

  listActiveMembershipsByDevice(deviceId: string): P2pWorkspaceMemberRow[] {
    return this.db
      .select()
      .from(p2pWorkspaceMembers)
      .where(
        and(
          eq(p2pWorkspaceMembers.deviceId, deviceId),
          eq(p2pWorkspaceMembers.status, 'active'),
        ),
      )
      .all()
  }

  create(input: CreateP2pMemberInput): P2pWorkspaceMemberRow {
    const now = new Date()
    const id = input.id ?? randomUUID()

    this.db
      .insert(p2pWorkspaceMembers)
      .values({
        id,
        workspaceId: input.workspaceId,
        identityId: input.identityId,
        deviceId: input.deviceId,
        displayName: input.displayName,
        role: input.role,
        status: input.status ?? 'invited',
        invitedBy: input.invitedBy ?? null,
        joinedAt: input.joinedAt ?? null,
        certJson: input.certJson ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.findById(id)!
  }

  update(input: UpdateP2pMemberInput): P2pWorkspaceMemberRow | null {
    const existing = this.findById(input.id)
    if (!existing) return null

    const now = new Date()
    this.db
      .update(p2pWorkspaceMembers)
      .set({
        displayName: input.displayName ?? existing.displayName,
        role: input.role ?? existing.role,
        status: input.status ?? existing.status,
        lastSeenAt: input.lastSeenAt ?? existing.lastSeenAt,
        certJson: input.certJson !== undefined ? input.certJson : existing.certJson,
        joinedAt: input.joinedAt ?? existing.joinedAt,
        updatedAt: now,
      })
      .where(eq(p2pWorkspaceMembers.id, input.id))
      .run()

    return this.findById(input.id)
  }
}
