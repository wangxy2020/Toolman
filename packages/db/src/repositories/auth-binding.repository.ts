import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import type { ToolmanDatabase } from '../index.js'
import { authBindings } from '../schema/auth.js'
import type { AuthBindingMetadata, AuthBindingRow, AuthProvider } from '../types/auth.js'

export interface UpsertAuthBindingInput {
  identityId: string
  provider: AuthProvider
  subjectId: string
  metadata?: AuthBindingMetadata
  verifiedAt?: Date
}

export class AuthBindingRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  listByIdentityId(identityId: string): AuthBindingRow[] {
    return this.db
      .select()
      .from(authBindings)
      .where(eq(authBindings.identityId, identityId))
      .all()
  }

  findByProviderSubject(provider: AuthProvider, subjectId: string): AuthBindingRow | null {
    return (
      this.db
        .select()
        .from(authBindings)
        .where(and(eq(authBindings.provider, provider), eq(authBindings.subjectId, subjectId)))
        .get() ?? null
    )
  }

  upsert(input: UpsertAuthBindingInput): AuthBindingRow {
    const existing = this.findByProviderSubject(input.provider, input.subjectId)
    const now = new Date()
    const verifiedAt = input.verifiedAt ?? now
    const metadataJson = JSON.stringify(input.metadata ?? {})

    if (existing) {
      this.db
        .update(authBindings)
        .set({
          identityId: input.identityId,
          metadataJson,
          verifiedAt,
          updatedAt: now,
        })
        .where(eq(authBindings.id, existing.id))
        .run()
      return this.findByProviderSubject(input.provider, input.subjectId)!
    }

    const id = randomUUID()
    this.db
      .insert(authBindings)
      .values({
        id,
        identityId: input.identityId,
        provider: input.provider,
        subjectId: input.subjectId,
        metadataJson,
        verifiedAt,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.findByProviderSubject(input.provider, input.subjectId)!
  }

  deleteByIdentityId(identityId: string): number {
    const rows = this.listByIdentityId(identityId)
    for (const row of rows) {
      this.db.delete(authBindings).where(eq(authBindings.id, row.id)).run()
    }
    return rows.length
  }

  deleteByIdentityIdAndProvider(identityId: string, provider: AuthProvider): number {
    const rows = this.listByIdentityId(identityId).filter((row) => row.provider === provider)
    for (const row of rows) {
      this.db.delete(authBindings).where(eq(authBindings.id, row.id)).run()
    }
    return rows.length
  }

  deleteById(id: string): boolean {
    const existing = this.db.select().from(authBindings).where(eq(authBindings.id, id)).get()
    if (!existing) return false
    this.db.delete(authBindings).where(eq(authBindings.id, id)).run()
    return true
  }
}
