import { eq } from 'drizzle-orm'

import type { ToolmanDatabase } from '../index.js'
import { AUTH_SESSION_SLOT, authSessions } from '../schema/auth.js'
import type { AuthRegion, AuthSessionRow } from '../types/auth.js'

export interface UpsertAuthSessionInput {
  identityId?: string | null
  isLoggedIn?: boolean
  preferredRegion?: AuthRegion | null
  accessTokenRef?: string | null
  refreshTokenRef?: string | null
  idTokenRef?: string | null
  hubTokenRef?: string | null
  tokenExpiresAt?: Date | null
  lastLoginAt?: Date | null
}

export class AuthSessionRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  getCurrent(): AuthSessionRow | null {
    return (
      this.db.select().from(authSessions).where(eq(authSessions.id, AUTH_SESSION_SLOT)).get() ??
      null
    )
  }

  ensureCurrent(identityId: string): AuthSessionRow {
    const existing = this.getCurrent()
    const now = new Date()
    if (existing) {
      if (!existing.identityId) {
        this.db
          .update(authSessions)
          .set({ identityId, updatedAt: now })
          .where(eq(authSessions.id, AUTH_SESSION_SLOT))
          .run()
        return this.getCurrent()!
      }
      return existing
    }

    this.db
      .insert(authSessions)
      .values({
        id: AUTH_SESSION_SLOT,
        identityId,
        isLoggedIn: false,
        updatedAt: now,
      })
      .run()

    return this.getCurrent()!
  }

  updateCurrent(input: UpsertAuthSessionInput): AuthSessionRow {
    const existing = this.getCurrent()
    if (!existing) {
      throw new Error('Auth session row not initialized')
    }

    const now = new Date()
    this.db
      .update(authSessions)
      .set({
        identityId: input.identityId === undefined ? existing.identityId : input.identityId,
        isLoggedIn: input.isLoggedIn ?? existing.isLoggedIn,
        preferredRegion:
          input.preferredRegion === undefined ? existing.preferredRegion : input.preferredRegion,
        accessTokenRef:
          input.accessTokenRef === undefined ? existing.accessTokenRef : input.accessTokenRef,
        refreshTokenRef:
          input.refreshTokenRef === undefined ? existing.refreshTokenRef : input.refreshTokenRef,
        idTokenRef: input.idTokenRef === undefined ? existing.idTokenRef : input.idTokenRef,
        hubTokenRef: input.hubTokenRef === undefined ? existing.hubTokenRef : input.hubTokenRef,
        tokenExpiresAt:
          input.tokenExpiresAt === undefined ? existing.tokenExpiresAt : input.tokenExpiresAt,
        lastLoginAt: input.lastLoginAt === undefined ? existing.lastLoginAt : input.lastLoginAt,
        updatedAt: now,
      })
      .where(eq(authSessions.id, AUTH_SESSION_SLOT))
      .run()

    return this.getCurrent()!
  }

  clearLocalSession(): AuthSessionRow {
    return this.updateCurrent({
      isLoggedIn: false,
      accessTokenRef: null,
      refreshTokenRef: null,
      idTokenRef: null,
      hubTokenRef: null,
      tokenExpiresAt: null,
    })
  }
}
