import { IpcChannel } from '@toolman/shared'

export async function materializeGroupKnowledgeDocument(
  p2pWorkspaceId: string,
  resourceId: string,
  documentId: string,
): Promise<{ absolutePath: string } | { error: string }> {
  const result = await window.api.invoke(IpcChannel.P2pKnowledgeMaterializeDocument, {
    workspaceId: p2pWorkspaceId,
    resourceId,
    documentId,
  })

  if (!result.ok) {
    return { error: result.error.message }
  }

  const data = result.data as { absolutePath: string }
  return { absolutePath: data.absolutePath }
}

export async function ensureGroupKnowledgeDocumentSaved(
  p2pWorkspaceId: string,
  resourceId: string,
  documentId: string,
): Promise<
  { absolutePath: string; savedDocumentId: string } | { error: string }
> {
  const catchUp = await window.api.invoke(IpcChannel.P2pSyncCatchUp, {
    workspaceId: p2pWorkspaceId,
  })
  if (!catchUp.ok) {
    return { error: catchUp.error.message }
  }

  const result = await window.api.invoke(IpcChannel.P2pKnowledgeEnsureDocumentSaved, {
    workspaceId: p2pWorkspaceId,
    resourceId,
    documentId,
  })

  if (!result.ok) {
    return { error: result.error.message }
  }

  const data = result.data as { absolutePath: string; savedDocumentId: string }
  return { absolutePath: data.absolutePath, savedDocumentId: data.savedDocumentId }
}

export async function removeGroupKnowledgeSavedDocuments(
  workspaceId: string,
  kbId: string,
  documentIds: string[],
): Promise<{ error?: string }> {
  for (const documentId of documentIds) {
    const result = await window.api.invoke(IpcChannel.KnowledgeDocumentDelete, {
      workspaceId,
      kbId,
      documentId,
    })
    if (!result.ok) {
      return { error: result.error.message }
    }
  }
  return {}
}
