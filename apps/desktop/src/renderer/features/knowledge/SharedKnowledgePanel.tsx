import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Workspace } from '@toolman/shared'
import {
  KnowledgeBaseFilePanel,
  knowledgeDocumentToPanelItem,
} from './KnowledgeBaseFilePanel'
import { sortKnowledgeFilePanelItems } from './knowledge-file-sort'
import { useKnowledgeDocuments } from './useKnowledgeDocuments'
import type { SharedKnowledgeEntry } from './useAllP2pSharedKnowledge'

interface Props {
  entry: SharedKnowledgeEntry
  onOpenError?: (message: string) => void
}

export function SharedKnowledgePanel({ entry, onOpenError }: Props) {
  const [localWorkspaceId, setLocalWorkspaceId] = useState<string | null>(null)
  const kbId = entry.resource.localResourceId ?? entry.resource.id
  const documents = useKnowledgeDocuments(localWorkspaceId, kbId)

  useEffect(() => {
    void window.api.invoke(IpcChannel.WorkspaceGetDefault).then((result) => {
      if (result.ok) {
        setLocalWorkspaceId((result.data as Workspace).id)
      }
    })
  }, [])

  useEffect(() => {
    void window.api.invoke(IpcChannel.P2pSyncForce, {
      workspaceId: entry.p2pWorkspaceId,
    })
  }, [entry.p2pWorkspaceId])

  useEffect(() => {
    if (!localWorkspaceId) return
    void documents.load()
  }, [documents.load, entry.resource.updatedAt, localWorkspaceId])

  useEffect(() => {
    const handleKnowledgeEvent = (payload: unknown) => {
      const event = payload as {
        workspaceId?: string
        resourceType?: string
        payload?: Record<string, unknown>
      }
      if (event.workspaceId !== entry.p2pWorkspaceId || event.resourceType !== 'Knowledge') return
      const eventKbId = event.payload?.kb_id
      if (typeof eventKbId === 'string' && eventKbId !== kbId) return
      void documents.load()
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleKnowledgeEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleKnowledgeEvent)
    const unsubscribeCompleted = window.api.subscribe('p2p:sync:completed', (payload) => {
      const event = payload as { workspaceId?: string }
      if (event.workspaceId !== entry.p2pWorkspaceId) return
      void documents.load()
    })

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
      unsubscribeCompleted()
    }
  }, [documents.load, entry.p2pWorkspaceId, kbId])

  const panelDocuments = useMemo(() => {
    let items = documents.items.map(knowledgeDocumentToPanelItem)
    const sharedDocIds = entry.resource.sharedDocumentIds
    if (sharedDocIds && sharedDocIds.length > 0) {
      const allowed = new Set(sharedDocIds)
      items = items.filter((item) => allowed.has(item.id))
    }
    return sortKnowledgeFilePanelItems(items, 'createdAt', false)
  }, [documents.items, entry.resource.sharedDocumentIds])

  const handleImportError = useCallback(
    (message: string) => {
      onOpenError?.(message)
      documents.setError(message)
    },
    [documents, onOpenError],
  )

  return (
    <KnowledgeBaseFilePanel
      documents={panelDocuments}
      loading={Boolean(documents.loading && panelDocuments.length === 0)}
      hideDropzone
      importDisabled
      onImportFiles={() => {}}
      onImportError={handleImportError}
    />
  )
}
