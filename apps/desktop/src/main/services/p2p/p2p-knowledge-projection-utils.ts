import { existsSync } from 'node:fs'
import { sep } from 'node:path'
import { hashFileBytes } from '@toolman/knowledge'
import { P2pSharedResourceRepository } from '@toolman/db'
import { isP2pSharedKnowledgeMirrorDescription } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getKnowledgeBaseRepository } from '../../db/repos'
import { blobExists, writeBlobFromPath } from '../blob.service'
import { isSystemKnowledgeBase } from '../knowledge-default-folder-kb.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import {
  stripGroupPrefixedName,
} from './p2p-group-resource-naming'
import { getActiveWorkspaceMember } from './p2p-permission.guard'

export function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

export function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

export function readSharedKnowledgeSourceWorkspaceId(metadataJson: string | null | undefined): string | null {
  if (!metadataJson) return null
  try {
    const parsed = JSON.parse(metadataJson) as { sourceWorkspaceId?: string }
    return typeof parsed.sourceWorkspaceId === 'string' ? parsed.sourceWorkspaceId : null
  } catch {
    return null
  }
}

export function isLocalKnowledgeSharer(p2pWorkspaceId: string, sharedBy: string | null | undefined): boolean {
  if (!sharedBy) return false
  try {
    return getActiveWorkspaceMember(p2pWorkspaceId).id === sharedBy
  } catch {
    return false
  }
}

/** Keep the sharer's original local KB row out of P2P mirror/projection state. */
export function protectOwnerSourceKnowledgeBase(
  p2pWorkspaceId: string,
  sourceKbId: string,
  sourceWorkspaceId: string,
  originalName?: string,
): void {
  const kbRepo = getKnowledgeBaseRepository()
  const row = kbRepo.findRowById(sourceKbId, sourceWorkspaceId)
  if (!row) return

  const plainName = stripGroupPrefixedName(p2pWorkspaceId, originalName ?? row.name)
  const targetName = isSystemKnowledgeBase(row)
    ? row.name
    : isSystemKnowledgeBase({ name: plainName })
      ? plainName
      : plainName

  const mirrorDescription = isP2pSharedKnowledgeMirrorDescription(row.description)
  const needsRestore =
    row.kind !== 'local' ||
    row.name !== targetName ||
    mirrorDescription

  if (!needsRestore) return

  const description = mirrorDescription
    ? isSystemKnowledgeBase({ name: targetName })
      ? '默认文件夹知识库'
      : null
    : row.description

  kbRepo.update({
    id: sourceKbId,
    workspaceId: sourceWorkspaceId,
    name: targetName,
    kind: 'local',
    description,
  })

  const updated = kbRepo.findRowById(sourceKbId, sourceWorkspaceId)
  if (!updated) return

  const storagePath = resolveKnowledgeBaseStoragePath(updated, { ensure: true })
  if (storagePath) {
    ensureKnowledgeBaseStorageSource(sourceWorkspaceId, sourceKbId, storagePath)
  }
}

export function isP2pSyncedKnowledgePath(absolutePath: string): boolean {
  return absolutePath.includes(`${sep}p2p-sync${sep}`)
}

export function ensureLocalBlobFromDocument(
  doc: {
    absolutePath?: string | null
  } | null,
  contentHash: string,
): boolean {
  const path = doc?.absolutePath
  if (!path || !existsSync(path) || isP2pSyncedKnowledgePath(path)) {
    return false
  }
  try {
    if (hashFileBytes(path) !== contentHash) {
      return false
    }
    if (!blobExists(contentHash)) {
      writeBlobFromPath(path)
    }
    return blobExists(contentHash)
  } catch {
    return false
  }
}
