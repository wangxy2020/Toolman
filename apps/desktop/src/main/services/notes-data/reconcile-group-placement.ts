import { P2pMemberRepository, P2pSharedResourceRepository, P2pWorkspaceRepository } from '@toolman/db'
import {
  reconcileReceivedGroupSharedNotes,
  type GroupSharedNotePlacement,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from '../p2p/p2p-device-identity.service'
import { resolveGroupNotebookName } from '../p2p/note-notebook-placement'
import type { NotesData } from './types'

function collectGroupNotePlacements(): {
  placements: GroupSharedNotePlacement[]
  selfMemberIdByWorkspace: Record<string, string | null>
} {
  const db = getDatabase()
  const sharedRepo = new P2pSharedResourceRepository(db)
  const memberRepo = new P2pMemberRepository(db)
  const workspaceRepo = new P2pWorkspaceRepository(db)
  const deviceId = getP2pDeviceInfo().deviceId

  const selfMemberIdByWorkspace: Record<string, string | null> = {}
  const placements: GroupSharedNotePlacement[] = []

  for (const workspace of workspaceRepo.listActive()) {
    const member = memberRepo.findByWorkspaceAndDevice(workspace.id, deviceId)
    selfMemberIdByWorkspace[workspace.id] = member?.id ?? null

    for (const resource of sharedRepo.listByWorkspace(workspace.id)) {
      if (resource.resourceType !== 'Note' || resource.status !== 'active') continue
      const noteId = resource.localResourceId ?? resource.id
      if (!noteId) continue

      placements.push({
        noteId,
        p2pWorkspaceId: workspace.id,
        workspaceName: workspace.name?.trim() || resolveGroupNotebookName(workspace.id),
        sharedBy: resource.sharedBy,
      })
    }
  }

  return { placements, selfMemberIdByWorkspace }
}

export function reconcileNotesDataGroupPlacement(data: NotesData): NotesData {
  const { placements, selfMemberIdByWorkspace } = collectGroupNotePlacements()
  if (placements.length === 0) return data

  const result = reconcileReceivedGroupSharedNotes({
    notebooks: data.notebooks,
    notes: data.notes,
    placements,
    selfMemberIdByWorkspace,
  })

  if (!result.changed) return data
  return {
    ...data,
    notebooks: result.notebooks,
    notes: result.notes,
  }
}
