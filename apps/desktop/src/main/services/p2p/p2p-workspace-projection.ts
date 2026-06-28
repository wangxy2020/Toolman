import { P2pMemberRepository, P2pWorkspaceRepository } from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { broadcastP2pMemberChanged } from './p2p-member-broadcast'
import { broadcastP2pWorkspaceDissolved } from './p2p-workspace-broadcast'
import { cleanupLocalMemberDeparture } from './p2p-workspace-member-cleanup.service'
import { isLocalWorkspaceOwner } from './p2p-sync-sequencing'

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

export function markWorkspaceMembersLeft(workspaceId: string): void {
  const memberRepo = getMemberRepo()
  for (const member of memberRepo.listByWorkspace(workspaceId)) {
    if (member.status === 'active' || member.status === 'invited') {
      memberRepo.update({ id: member.id, status: 'left' })
    }
  }
}

export function applyWorkspaceDissolvedState(
  workspaceId: string,
  options?: { deferMemberLeft?: boolean },
): boolean {
  const workspaceRepo = getWorkspaceRepo()
  const row = workspaceRepo.findById(workspaceId)
  if (!row) {
    return false
  }

  if (!options?.deferMemberLeft) {
    markWorkspaceMembersLeft(workspaceId)
  }

  workspaceRepo.softDelete(workspaceId)
  return true
}

export async function finalizeLocalWorkspaceDissolve(workspaceId: string): Promise<void> {
  markWorkspaceMembersLeft(workspaceId)
  const { stopP2pSync } = await import('./p2p-sync.service')
  stopP2pSync(workspaceId)
  await cleanupLocalMemberDeparture(workspaceId)
}

function shouldDeferDissolveCleanup(event: WorkspaceEvent): boolean {
  const localDeviceId = getP2pDeviceInfo().deviceId
  return event.sourceDeviceId === localDeviceId && isLocalWorkspaceOwner(event.workspaceId)
}

export function projectWorkspaceDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Workspace' || event.eventType !== 'Deleted') {
    return
  }

  const deferCleanup = shouldDeferDissolveCleanup(event)
  if (!applyWorkspaceDissolvedState(event.workspaceId, { deferMemberLeft: deferCleanup })) {
    return
  }

  broadcastP2pWorkspaceDissolved({ workspaceId: event.workspaceId })
  broadcastP2pMemberChanged({ workspaceId: event.workspaceId })

  if (!deferCleanup) {
    void finalizeLocalWorkspaceDissolve(event.workspaceId)
  }
}
