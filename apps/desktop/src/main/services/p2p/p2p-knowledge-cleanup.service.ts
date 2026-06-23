import { sep } from 'node:path'
import { P2pSharedResourceRepository } from '@toolman/db'
import {
  parseP2pSharedKnowledgeMirrorMeta,
  isP2pSharedKnowledgeMirrorDescription,
  isP2pGroupSavedKnowledgeDescription,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { deleteKnowledgeBase } from '../knowledge.service'
import { stopKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import { stripGroupPrefixedName } from './p2p-group-resource-naming'
import { getActiveWorkspaceMember } from './p2p-permission.guard'
import { protectOwnerSourceKnowledgeBase } from './p2p-knowledge-projection'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function isPollutedP2pProjectionDocument(absolutePath: string | null | undefined): boolean {
  if (!absolutePath) return false
  return (
    absolutePath.includes(`${sep}p2p-sync${sep}`) ||
    absolutePath.includes('/共享知识库/') ||
    absolutePath.includes('\\共享知识库\\')
  )
}

function resolveSharedByForSourceKb(p2pWorkspaceId: string, sourceKbId: string): string | null {
  const shared =
    getSharedResourceRepo().findByWorkspaceAndLocalResource(
      p2pWorkspaceId,
      sourceKbId,
      'Knowledge',
    ) ?? getSharedResourceRepo().findById(sourceKbId)
  return shared?.sharedBy ?? null
}

function isLocalSharer(p2pWorkspaceId: string, sharedBy: string | null): boolean {
  if (!sharedBy) return false
  try {
    return getActiveWorkspaceMember(p2pWorkspaceId).id === sharedBy
  } catch {
    return false
  }
}

function purgePollutedDocumentsFromKb(kbId: string, workspaceId: string): number {
  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()
  let removed = 0

  for (const doc of docRepo.listByKb(kbId)) {
    if (!isPollutedP2pProjectionDocument(doc.absolutePath)) continue
    if (docRepo.softDelete(doc.id, kbId)) {
      removed += 1
    }
  }

  if (removed > 0) {
    kbRepo.update({
      id: kbId,
      workspaceId,
      documentCount: docRepo.listByKb(kbId).length,
    })
  }

  return removed
}

function isGroupPrefixedKnowledgeBaseName(name: string): boolean {
  return /^\[[^\]]+\]\s/.test(name.trim())
}

function isPollutedP2pProjectedKnowledgeBase(row: {
  id: string
  name: string
  kind: string
  description: string | null
}): boolean {
  const meta = parseP2pSharedKnowledgeMirrorMeta(row.description)
  if (meta) {
    // Legacy P2P mirror KB rows are no longer used; members only keep downloaded folders.
    return true
  }
  if (isP2pSharedKnowledgeMirrorDescription(row.description)) {
    return true
  }
  if (isP2pGroupSavedKnowledgeDescription(row.description)) {
    return false
  }
  if (isGroupPrefixedKnowledgeBaseName(row.name) && row.kind !== 'local') {
    return true
  }
  return false
}

/**
 * Remove P2P mirror rows that were incorrectly stored on the source knowledge base id,
 * and scrub projection garbage documents from the sharer's source KB.
 */
export async function cleanupMisplacedP2pMirrorKnowledgeBases(): Promise<{
  purgedKbCount: number
  restoredKbCount: number
  removedDocCount: number
}> {
  const kbRepo = getKnowledgeBaseRepository()
  let purgedKbCount = 0
  let restoredKbCount = 0
  let removedDocCount = 0

  for (const row of kbRepo.listAllActive()) {
    if (isPollutedP2pProjectedKnowledgeBase(row)) {
      const meta = parseP2pSharedKnowledgeMirrorMeta(row.description)
      if (
        meta &&
        row.id === meta.sourceKbId &&
        isLocalSharer(meta.p2pWorkspaceId, resolveSharedByForSourceKb(meta.p2pWorkspaceId, meta.sourceKbId))
      ) {
        const plainName = stripGroupPrefixedName(meta.p2pWorkspaceId, row.name)
        protectOwnerSourceKnowledgeBase(
          meta.p2pWorkspaceId,
          row.id,
          row.workspaceId,
          plainName,
        )
        stopKnowledgeWatchersForKb(row.workspaceId, row.id)
        removedDocCount += purgePollutedDocumentsFromKb(row.id, row.workspaceId)
        restoredKbCount += 1
        continue
      }

      stopKnowledgeWatchersForKb(row.workspaceId, row.id)
      const deleted = await deleteKnowledgeBase({ id: row.id, workspaceId: row.workspaceId })
      if (deleted) {
        purgedKbCount += 1
      }
      continue
    }
  }

  return { purgedKbCount, restoredKbCount, removedDocCount }
}

export function isInternalP2pMirrorKnowledgeBase(description: string | null | undefined): boolean {
  return isP2pSharedKnowledgeMirrorDescription(description)
}
