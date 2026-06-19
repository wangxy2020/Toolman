import { createHash, randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pInvites } from '../schema/p2p.js'
import type { P2pInviteRow, P2pInvitableMemberRole } from '../types/p2p.js'

export interface CreateP2pInviteInput {
  workspaceId: string
  tokenHash: string
  role: P2pInvitableMemberRole
  createdBy: string
  maxUses?: number
  expiresAt: Date
}

export class P2pInviteRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string): P2pInviteRow | null {
    return this.db.select().from(p2pInvites).where(eq(p2pInvites.id, id)).get() ?? null
  }

  findActiveByTokenHash(tokenHash: string): P2pInviteRow | null {
    const row = this.db
      .select()
      .from(p2pInvites)
      .where(and(eq(p2pInvites.tokenHash, tokenHash), isNull(p2pInvites.revokedAt)))
      .get()
    return row ?? null
  }

  create(input: CreateP2pInviteInput): P2pInviteRow {
    const now = new Date()
    const id = randomUUID()

    this.db
      .insert(p2pInvites)
      .values({
        id,
        workspaceId: input.workspaceId,
        tokenHash: input.tokenHash,
        role: input.role,
        createdBy: input.createdBy,
        maxUses: input.maxUses ?? 1,
        useCount: 0,
        expiresAt: input.expiresAt,
        createdAt: now,
      })
      .run()

    return this.findById(id)!
  }

  incrementUseCount(id: string): P2pInviteRow | null {
    const existing = this.findById(id)
    if (!existing) return null

    this.db
      .update(p2pInvites)
      .set({
        useCount: existing.useCount + 1,
      })
      .where(eq(p2pInvites.id, id))
      .run()

    return this.findById(id)
  }

  revoke(id: string): boolean {
    const existing = this.findById(id)
    if (!existing || existing.revokedAt) return false

    const now = new Date()
    this.db
      .update(p2pInvites)
      .set({ revokedAt: now })
      .where(eq(p2pInvites.id, id))
      .run()

    return true
  }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
