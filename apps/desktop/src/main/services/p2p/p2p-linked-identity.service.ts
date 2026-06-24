import { eq } from 'drizzle-orm'
import { identities, type ToolmanDatabase } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getLocalIdentityId } from '../local-identity'

/**
 * Ensure a peer identity exists locally so p2p_workspaces / p2p_workspace_members
 * foreign keys succeed when joining or syncing remote members.
 */
export function ensureLinkedIdentityRowInDb(
  db: ToolmanDatabase,
  identityId: string,
  displayName = '远程用户',
): void {
  const trimmedId = identityId.trim()
  if (!trimmedId || trimmedId === getLocalIdentityId()) {
    return
  }

  const existing = db.select().from(identities).where(eq(identities.id, trimmedId)).get()
  if (existing) {
    if (displayName && existing.displayName !== displayName && existing.type === 'linked') {
      db.update(identities)
        .set({ displayName, updatedAt: new Date() })
        .where(eq(identities.id, trimmedId))
        .run()
    }
    return
  }

  const now = new Date()
  db.insert(identities)
    .values({
      id: trimmedId,
      type: 'linked',
      displayName: displayName.trim() || '远程用户',
      registrationStatus: 'guest',
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

export function ensureLinkedIdentityRow(identityId: string, displayName?: string): void {
  ensureLinkedIdentityRowInDb(getDatabase(), identityId, displayName)
}
