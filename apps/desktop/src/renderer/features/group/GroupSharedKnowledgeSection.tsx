import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type P2pSharedResource, type Workspace } from '@toolman/shared'
import { IconChevronRight, IconTrash } from '../../components/icons'
import {
  knowledgeDocumentToPanelItem,
} from '../knowledge/KnowledgeBaseFilePanel'
import {
  sortKnowledgeFilePanelItems,
  type KnowledgeFileSortField,
} from '../knowledge/knowledge-file-sort'
import { useKnowledgeDocuments } from '../knowledge/useKnowledgeDocuments'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'
import { GroupKnowledgeFileList } from './GroupKnowledgeFileList'
import { knowledgeSelectionKey } from './group-knowledge-selection'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest } from './group-note-open'
import type { KnowledgeFilePanelItem } from '../knowledge/KnowledgeBaseFilePanel'

interface Props {
  p2pWorkspaceId: string
  sourceWorkspaceId: string | null
  workspaceName: string
  resource: P2pSharedResource
  selectedKeys: Set<string>
  canDelete: boolean
  removingKb?: boolean
  removingDocumentId?: string | null
  onToggleSelect: (selectionKey: string) => void
  onToggleSelectSection: (selectionKeys: string[]) => void
  onRemoveKb: () => void
  onRemoveDocument: (documentId: string) => void
  onOpenNote?: (noteId: string) => boolean
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenGroupKnowledgeMarkdown?: (
    request: OpenGroupKnowledgeMarkdownRequest,
  ) => void | Promise<void>
  onOpenFileMenu?: (
    doc: KnowledgeFilePanelItem,
    anchor: { x: number; y: number; align: 'bottom-start' },
  ) => void
  onOpenError?: (message: string) => void
  onContextMenu?: (event: React.MouseEvent) => void
  onSectionKeysChange?: (resourceId: string, keys: string[]) => void
}

export function GroupSharedKnowledgeSection({
  p2pWorkspaceId,
  sourceWorkspaceId: _sourceWorkspaceId,
  workspaceName,
  resource,
  selectedKeys,
  canDelete,
  removingKb,
  removingDocumentId,
  onToggleSelect,
  onToggleSelectSection,
  onRemoveKb,
  onRemoveDocument,
  onOpenNote,
  onOpenGroupNote,
  onOpenGroupKnowledgeMarkdown,
  onOpenFileMenu,
  onOpenError,
  onContextMenu,
  onSectionKeysChange,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const [localWorkspaceId, setLocalWorkspaceId] = useState<string | null>(null)
  const kbId = resource.localResourceId ?? resource.id
  const documentWorkspaceId = localWorkspaceId
  const documents = useKnowledgeDocuments(documentWorkspaceId, kbId)
  const sortField: KnowledgeFileSortField = 'createdAt'

  useEffect(() => {
    void window.api.invoke(IpcChannel.WorkspaceGetDefault).then((result) => {
      if (result.ok) {
        setLocalWorkspaceId((result.data as Workspace).id)
      }
    })
  }, [])

  useEffect(() => {
    void window.api.invoke(IpcChannel.P2pSyncForce, { workspaceId: p2pWorkspaceId })
  }, [p2pWorkspaceId])

  useEffect(() => {
    if (!documentWorkspaceId) return
    void documents.load()
  }, [documentWorkspaceId, documents.load, resource.updatedAt])

  useEffect(() => {
    const handleKnowledgeEvent = (payload: unknown) => {
      const event = payload as {
        workspaceId?: string
        resourceType?: string
        payload?: Record<string, unknown>
      }
      if (event.workspaceId !== p2pWorkspaceId || event.resourceType !== 'Knowledge') return
      const eventKbId = event.payload?.kb_id
      if (typeof eventKbId === 'string' && eventKbId !== kbId) return
      void documents.load()
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleKnowledgeEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleKnowledgeEvent)
    const unsubscribeCompleted = window.api.subscribe('p2p:sync:completed', (payload) => {
      const event = payload as { workspaceId?: string }
      if (event.workspaceId !== p2pWorkspaceId) return
      void documents.load()
    })

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
      unsubscribeCompleted()
    }
  }, [documents.load, kbId, p2pWorkspaceId])

  const panelDocuments = useMemo(() => {
    let items = documents.items.map(knowledgeDocumentToPanelItem)
    const sharedDocIds = resource.sharedDocumentIds
    if (sharedDocIds && sharedDocIds.length > 0) {
      const allowed = new Set(sharedDocIds)
      items = items.filter((item) => allowed.has(item.id))
    }
    return sortKnowledgeFilePanelItems(items, sortField, false)
  }, [documents.items, resource.sharedDocumentIds, sortField])

  const resolveDocumentPath = useCallback(
    async (documentId: string, currentPath?: string | null): Promise<string | null> => {
      if (currentPath) return currentPath
      if (!documentWorkspaceId) return null

      const syncResult = await window.api.invoke(IpcChannel.P2pKnowledgeSyncDocument, {
        workspaceId: p2pWorkspaceId,
        knowledgeBaseId: kbId,
        documentId,
      })
      if (!syncResult.ok) {
        onOpenError?.(syncResult.error.message)
        return null
      }

      const listResult = await window.api.invoke(IpcChannel.KnowledgeDocumentList, {
        workspaceId: documentWorkspaceId,
        kbId,
      })
      if (!listResult.ok) {
        onOpenError?.(listResult.error.message)
        return null
      }

      const data = listResult.data as { items: Array<{ id: string; absolutePath?: string | null }> }
      const doc = data.items.find((item) => item.id === documentId)
      return doc?.absolutePath ?? null
    },
    [documentWorkspaceId, kbId, onOpenError, p2pWorkspaceId],
  )

  const handleOpenGroupKnowledgeMarkdown = useCallback(
    async (request: OpenGroupKnowledgeMarkdownRequest) => {
      const absolutePath =
        request.absolutePath ??
        (await resolveDocumentPath(request.documentId))
      if (!absolutePath) {
        onOpenError?.('文档尚未同步到本地，请稍后重试')
        return
      }
      await onOpenGroupKnowledgeMarkdown?.({
        ...request,
        absolutePath,
      })
    },
    [onOpenGroupKnowledgeMarkdown, onOpenError, resolveDocumentPath],
  )

  const handleOpenGroupNote = useCallback(
    async (request: OpenGroupNoteRequest) => {
      await onOpenGroupNote?.({
        ...request,
        workspaceId: p2pWorkspaceId,
        workspaceName,
      })
    },
    [onOpenGroupNote, p2pWorkspaceId, workspaceName],
  )

  const sectionSelectionKeys = useMemo(
    () => panelDocuments.map((doc) => knowledgeSelectionKey(resource.id, doc.id)),
    [panelDocuments, resource.id],
  )

  useEffect(() => {
    onSectionKeysChange?.(resource.id, sectionSelectionKeys)
  }, [onSectionKeysChange, resource.id, sectionSelectionKeys])

  const sectionSelectedCount = sectionSelectionKeys.filter((key) => selectedKeys.has(key)).length
  const sectionFullySelected =
    sectionSelectionKeys.length > 0 && sectionSelectedCount === sectionSelectionKeys.length
  const sectionPartiallySelected =
    sectionSelectedCount > 0 && sectionSelectedCount < sectionSelectionKeys.length

  return (
    <section className="tm-group-kb-section">
      <header className="tm-group-kb-section-header">
        <button
          type="button"
          className="tm-group-kb-section-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <IconChevronRight open={expanded} />
        </button>

        <button
          type="button"
          className="tm-group-kb-section-heading"
          onClick={() => setExpanded((current) => !current)}
        >
          <h3 className="tm-group-kb-section-title">{resource.name}</h3>
          <p className="tm-group-kb-section-meta">{panelDocuments.length} 篇文档</p>
        </button>

        {canDelete ? (
          <div className="tm-group-kb-section-actions">
            <button
              type="button"
              className="tm-kb-file-card-action tm-kb-file-card-action--danger"
              title="从群组移除知识库"
              disabled={removingKb}
              onClick={onRemoveKb}
            >
              <IconTrash size={16} />
            </button>
            <GroupFileSelectCheckbox
              checked={sectionFullySelected}
              title={sectionPartiallySelected ? '部分选中' : '选择知识库内全部文件'}
              onChange={() => onToggleSelectSection(sectionSelectionKeys)}
            />
          </div>
        ) : null}
      </header>

      {expanded ? (
        !documentWorkspaceId ? (
          <p className="tm-kb-file-panel-empty">工作区未就绪</p>
        ) : documents.loading && panelDocuments.length === 0 ? (
          <p className="tm-kb-file-panel-empty">加载文件中…</p>
        ) : panelDocuments.length === 0 ? (
          <p className="tm-kb-file-panel-empty">
            {documents.error ? documents.error : '暂无共享文档，正在同步…'}
          </p>
        ) : (
          <GroupKnowledgeFileList
            resourceId={resource.id}
            p2pWorkspaceId={p2pWorkspaceId}
            workspaceName={workspaceName}
            documents={panelDocuments}
            selectedKeys={selectedKeys}
            canDelete={canDelete}
            ingesting={documents.ingesting}
            removingDocumentId={removingDocumentId}
            onToggleSelect={onToggleSelect}
            onRemoveDocument={onRemoveDocument}
            onReindexDocument={(documentId) => void documents.reindex(documentId)}
            onOpenNote={onOpenNote}
            onOpenGroupNote={handleOpenGroupNote}
            onOpenGroupKnowledgeMarkdown={handleOpenGroupKnowledgeMarkdown}
            onOpenFileMenu={onOpenFileMenu}
            onOpenError={onOpenError}
            onContextMenu={onContextMenu}
          />
        )
      ) : null}
    </section>
  )
}
