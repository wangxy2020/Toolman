import { P2pSharedResourceRepository, assistants } from '@toolman/db'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../../bootstrap/database'
import { getAssistantRowIncludingDeleted, updateAssistant } from '../../assistant.service'
import { getDefaultWorkspace } from '../../workspace.service'
import { readAgentShareMetadata } from './metadata'

export function clearGroupMirrorFlagFromSourceAssistant(assistantId: string): void {
  const existing = getAssistantRowIncludingDeleted(assistantId)
  if (!existing) return

  const params = JSON.parse(existing.parametersJson) as Record<string, unknown>
  if (!params.p2pGroupSharedMirror) return

  const { p2pGroupSharedMirror: _mirror, ...rest } = params
  updateAssistant({
    id: assistantId,
    parameters: rest,
  })
}

/** Owner's source assistants must never carry the joiner-only mirror flag. */
export function sanitizeOwnerSourceAgentMirrorFlags(workspaceId: string): void {
  const db = getDatabase()
  const sharedRepo = new P2pSharedResourceRepository(db)
  const rows = db
    .select()
    .from(assistants)
    .where(eq(assistants.workspaceId, workspaceId))
    .all()

  for (const row of rows) {
    if (row.deletedAt) continue

    const params = JSON.parse(row.parametersJson) as Record<string, unknown>
    if (!params.p2pGroupSharedMirror) continue

    const activeShares = sharedRepo.listActiveByLocalResource(row.id, 'Agent')
    const isOwnerSource = activeShares.some((share) => {
      const metadata = readAgentShareMetadata(share.metadataJson)
      return metadata.sourceWorkspaceId === workspaceId
    })

    if (isOwnerSource) {
      clearGroupMirrorFlagFromSourceAssistant(row.id)
    }
  }
}

export function resolveAgentImportWorkspaceId(): string | null {
  return getDefaultWorkspace()?.id ?? null
}
