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

function isPollutedP2pProjectionUri(uri: string | null | undefined): boolean {
  if (!uri) return false
  return (
    uri.includes(`${sep}p2p-sync${sep}`) ||
    uri.includes('/共享知识库/') ||
    uri.includes('\\共享知识库\\') ||
    uri.includes('/共享知识库') ||
    uri.includes('\\共享知识库')
  )
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

  for (const source of docRepo.listSourcesByKb(kbId)) {
    if (!isPollutedP2pProjectionUri(source.uri)) continue
    if (docRepo.softDeleteSource(source.id, kbId)) {
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
 *
 * Also scrub shared-folder ghost documents from normal local KBs (system default
 * 「默认文件夹」 often accumulates 共享知识库 paths from past P2P sources).
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

    // Local / system KBs are not "polluted KB rows", but may still hold ghost docs
    // indexed from a past 共享知识库 folder source.
    if (row.kind === 'local') {
      removedDocCount += purgePollutedDocumentsFromKb(row.id, row.workspaceId)
    }
  }

  return { purgedKbCount, restoredKbCount, removedDocCount }
}
