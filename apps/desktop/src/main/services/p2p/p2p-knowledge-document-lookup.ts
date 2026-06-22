import type { DocumentRow, DocumentRepository } from '@toolman/db'
import { listP2pSharedKnowledgeLocalKbIds } from '@toolman/shared'

export function resolveSharedKnowledgeIngestKbId(input: {
  p2pWorkspaceId: string
  sourceKbId: string
  isOwnerViewer: boolean
}): string {
  if (input.isOwnerViewer) {
    return input.sourceKbId
  }
  const ids = listP2pSharedKnowledgeLocalKbIds({
    p2pWorkspaceId: input.p2pWorkspaceId,
    sourceKbId: input.sourceKbId,
  })
  return ids[ids.length - 1] ?? input.sourceKbId
}

export function findSharedKnowledgeDocument(
  docRepo: DocumentRepository,
  input: {
    p2pWorkspaceId: string
    sourceKbId: string
    documentId: string
  },
): { doc: DocumentRow | null; kbId: string } {
  for (const kbId of listP2pSharedKnowledgeLocalKbIds({
    p2pWorkspaceId: input.p2pWorkspaceId,
    sourceKbId: input.sourceKbId,
  })) {
    const doc = docRepo.findById(input.documentId, kbId)
    if (doc) {
      return { doc, kbId }
    }
  }
  return { doc: null, kbId: input.sourceKbId }
}
