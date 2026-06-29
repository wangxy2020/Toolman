import { existsSync } from 'node:fs'
import { P2pSharedResourceRepository } from '@toolman/db'
import { hashFileBytes } from '@toolman/knowledge'
import { blobExists, writeBlobFromPath } from '../blob.service'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { readKnowledgeShareMetadata } from './p2p-knowledge-share-metadata'

export async function tryRecoverBlobFromSharedKnowledge(
  workspaceId: string,
  contentHash: string,
): Promise<boolean> {
  if (blobExists(contentHash)) return true

  const sharedRepo = new P2pSharedResourceRepository(getDatabase())
  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()

  const tryDocument = (doc: {
    absolutePath?: string | null
    contentHash?: string | null
    blobHash?: string | null
  }): boolean => {
    if (doc.blobHash !== contentHash && doc.contentHash !== contentHash) return false
    if (!doc.absolutePath || !existsSync(doc.absolutePath)) return false
    try {
      if (hashFileBytes(doc.absolutePath) !== contentHash) return false
      writeBlobFromPath(doc.absolutePath)
      return blobExists(contentHash)
    } catch {
      return false
    }
  }

  for (const resource of sharedRepo.listByWorkspace(workspaceId)) {
    if (resource.resourceType !== 'Knowledge' || resource.status !== 'active') continue
    const kbId = resource.localResourceId ?? resource.id
    const metadata = readKnowledgeShareMetadata(resource.metadataJson)
    const kbIds = new Set<string>([kbId])

    if (metadata.sourceWorkspaceId) {
      for (const kb of kbRepo.listByWorkspace(metadata.sourceWorkspaceId)) {
        kbIds.add(kb.id)
      }
    }

    for (const searchKbId of kbIds) {
      for (const doc of docRepo.listByKb(searchKbId)) {
        if (tryDocument(doc)) {
          return true
        }
      }
    }
  }

  return false
}
