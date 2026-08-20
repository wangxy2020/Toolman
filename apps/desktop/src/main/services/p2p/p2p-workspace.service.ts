import type { P2pWorkspace } from '@toolman/shared'
import {
  publishP2pGroupDeleteSyncChange,
  publishP2pGroupSyncChange,
} from '../group-mobile-sync'
import {
  bootstrapP2pWorkspaceKeys,
  createP2pWorkspace as createP2pWorkspaceImpl,
  getP2pWorkspace,
  listOwnedBuiltinDefaultP2pWorkspaceIds,
  listP2pWorkspaces,
  listPendingP2pJoinRequestIds,
  updateP2pWorkspace as updateP2pWorkspaceImpl,
} from './p2p-workspace-crud'
import {
  deleteP2pWorkspace as deleteP2pWorkspaceImpl,
  getP2pWorkspaceStoragePath,
  leaveP2pWorkspace as leaveP2pWorkspaceImpl,
} from './p2p-workspace-lifecycle'

export {
  bootstrapP2pWorkspaceKeys,
  getP2pWorkspace,
  getP2pWorkspaceStoragePath,
  listP2pWorkspaces,
  listPendingP2pJoinRequestIds,
}

export async function createP2pWorkspace(rawInput: unknown): Promise<{
  workspace: P2pWorkspace
  inviteToken: string
}> {
  const result = await createP2pWorkspaceImpl(rawInput)
  publishP2pGroupSyncChange(result.workspace)
  return result
}

export async function removeDefaultOwnedP2pWorkspaces(): Promise<number> {
  const ids = listOwnedBuiltinDefaultP2pWorkspaceIds()
  for (const id of ids) {
    await deleteP2pWorkspace(id)
  }
  return ids.length
}

export function updateP2pWorkspace(rawInput: unknown): P2pWorkspace {
  const workspace = updateP2pWorkspaceImpl(rawInput)
  publishP2pGroupSyncChange(workspace)
  return workspace
}

export async function deleteP2pWorkspace(id: string): Promise<void> {
  await deleteP2pWorkspaceImpl(id)
  publishP2pGroupDeleteSyncChange(id)
}

export async function leaveP2pWorkspace(id: string): Promise<void> {
  await leaveP2pWorkspaceImpl(id)
  publishP2pGroupDeleteSyncChange(id)
}
