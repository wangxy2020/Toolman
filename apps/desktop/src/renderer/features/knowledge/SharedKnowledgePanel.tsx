import { stripP2pGroupPrefixedResourceName } from '@toolman/shared'
import { useCallback, useMemo } from 'react'
import { KnowledgeBaseFilePanel } from './KnowledgeBaseFilePanel'
import type { SharedKnowledgeEntry } from './useAllP2pSharedKnowledge'
import { useSharedKnowledgePanelDocuments } from '../group/useSharedKnowledgePanelDocuments'

interface Props {
  entry: SharedKnowledgeEntry
  onOpenError?: (message: string) => void
}

export function SharedKnowledgePanel({ entry, onOpenError }: Props) {
  const kbId = entry.resource.localResourceId ?? entry.resource.id
  const sharedFolderName = useMemo(
    () => stripP2pGroupPrefixedResourceName(entry.workspaceName, entry.resource.name),
    [entry.resource.name, entry.workspaceName],
  )
  const { panelDocuments, loading } = useSharedKnowledgePanelDocuments({
    p2pWorkspaceId: entry.p2pWorkspaceId,
    workspaceName: entry.workspaceName,
    sharedFolderName,
    kbId,
    sharedDocumentIds: entry.resource.sharedDocumentIds,
  })

  const handleImportError = useCallback(
    (message: string) => {
      onOpenError?.(message)
    },
    [onOpenError],
  )

  return (
    <KnowledgeBaseFilePanel
      documents={panelDocuments}
      loading={loading}
      hideDropzone
      importDisabled
      onImportFiles={() => {}}
      onImportError={handleImportError}
    />
  )
}
