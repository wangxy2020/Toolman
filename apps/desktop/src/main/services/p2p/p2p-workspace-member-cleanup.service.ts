import { P2pPeerRepository, P2pSharedResourceRepository, assistants } from '@toolman/db'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../bootstrap/database'
import { getSessionRepository } from '../../db/repos'
import {
  releaseBuiltinAssistantFromGroupScope,
} from '../assistant.service'
import { deleteSession } from '../session.service'
import { getDefaultWorkspace } from '../workspace.service'
import { readP2pGroupAgentFromSessionRow } from './p2p-group-agent-proxy.service'
import { disconnectP2pPeer } from './p2p-connection.service'
import { resetPeerTrustPrompts } from './p2p-peer.service'
import { removeWorkspaceKey } from './p2p-workspace-key.store'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function getPeerRepo(): P2pPeerRepository {
  return new P2pPeerRepository(getDatabase())
}

function readGroupScopedAssistantParams(parametersJson: string): {
  mirrorWorkspaceId?: string
  proxyWorkspaceId?: string
} {
  try {
    const params = JSON.parse(parametersJson) as Record<string, unknown>
    const mirror = params.p2pGroupSharedMirror as { p2pWorkspaceId?: string } | undefined
    const proxy = params.p2pGroupProxy as { p2pWorkspaceId?: string } | undefined
    return {
      mirrorWorkspaceId: mirror?.p2pWorkspaceId,
      proxyWorkspaceId: proxy?.p2pWorkspaceId,
    }
  } catch {
    return {}
  }
}

function softDeleteAssistantWithSessions(assistantId: string): void {
  getSessionRepository().deleteByAssistantId(assistantId)
  getDatabase()
    .update(assistants)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(assistants.id, assistantId))
    .run()
}

export async function cleanupP2pWorkspaceMemberLocalState(p2pWorkspaceId: string): Promise<void> {
  const personalWorkspace = getDefaultWorkspace()
  if (!personalWorkspace) return

  const sharedRepo = getSharedResourceRepo()
  for (const row of sharedRepo.listByWorkspace(p2pWorkspaceId)) {
    if (row.status !== 'active') continue
    sharedRepo.update({ id: row.id, status: 'unshared' })
  }

  const db = getDatabase()
  const assistantRows = db
    .select()
    .from(assistants)
    .where(eq(assistants.workspaceId, personalWorkspace.id))
    .all()

  for (const row of assistantRows) {
    const { mirrorWorkspaceId, proxyWorkspaceId } = readGroupScopedAssistantParams(row.parametersJson)
    if (mirrorWorkspaceId !== p2pWorkspaceId && proxyWorkspaceId !== p2pWorkspaceId) {
      continue
    }

    if (row.isBuiltin) {
      releaseBuiltinAssistantFromGroupScope(row.id, p2pWorkspaceId)
      continue
    }

    if (row.deletedAt) continue
    softDeleteAssistantWithSessions(row.id)
  }

  const sessionRows = getSessionRepository().listRows({
    workspaceId: personalWorkspace.id,
    limit: 10_000,
  })
  for (const row of sessionRows) {
    const proxy = readP2pGroupAgentFromSessionRow(row.metadataJson)
    if (proxy?.p2pWorkspaceId === p2pWorkspaceId) {
      deleteSession({ id: row.id })
    }
  }

  resetPeerTrustPrompts()
  const peerDeviceIds = [
    ...new Set(getPeerRepo().listByWorkspace(p2pWorkspaceId).map((item) => item.deviceId)),
  ]
  await Promise.all(
    peerDeviceIds.map((deviceId) => disconnectP2pPeer(deviceId).catch(() => undefined)),
  )
  getPeerRepo().deleteByWorkspace(p2pWorkspaceId)
}

export async function cleanupLocalMemberDeparture(p2pWorkspaceId: string): Promise<void> {
  await cleanupP2pWorkspaceMemberLocalState(p2pWorkspaceId)
  removeWorkspaceKey(p2pWorkspaceId)
}
