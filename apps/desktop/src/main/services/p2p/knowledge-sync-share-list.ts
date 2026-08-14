import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { getKnowledgeBaseRepository } from '../../db/repos'
import { syncP2pKnowledgeDocument } from './knowledge-sync-document.service'
import { getSharedResourceRepo } from './knowledge-sync-shared-resource'

export async function maybeSyncSharedKnowledgeDocument(
  sourceWorkspaceId: string,
  kbId: string,
  documentId: string,
): Promise<void> {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, sourceWorkspaceId)
  if (kb?.kind === 'shared') {
    return
  }

  const sharedRepo = getSharedResourceRepo()
  const shares = sharedRepo.listActiveByLocalResource(kbId, 'Knowledge')

  for (const shared of shares) {
    try {
      await syncP2pKnowledgeDocument({
        workspaceId: shared.workspaceId,
        knowledgeBaseId: kbId,
        documentId,
      })
    } catch (error) {
      const message = toErrorMessage(error, String(error))
      logStructured('p2p', 'warn', `auto knowledge sync failed for ${documentId}: ${message}`)
    }
  }
}
