import { useEffect, useMemo, useState } from 'react'
import type { P2pSharedResource } from '@toolman/shared'
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
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest, SaveGroupNoteAsCopyRequest } from './group-note-open'
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
  sourceWorkspaceId,
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
  const kbId = resource.localResourceId ?? resource.id
  const documentWorkspaceId = resource.sourceWorkspaceId ?? sourceWorkspaceId ?? p2pWorkspaceId
  const documents = useKnowledgeDocuments(documentWorkspaceId, kbId)
  const sortField: KnowledgeFileSortField = 'createdAt'

  useEffect(() => {
    void documents.load()
  }, [documents.load, resource.updatedAt])

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

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
    }
  }, [documents.load, kbId, p2pWorkspaceId])

  const panelDocuments = useMemo(() => {
    let items = documents.items.map(knowledgeDocumentToPanelItem)
    if (resource.sharedDocumentIds && resource.sharedDocumentIds.length > 0) {
      const allowed = new Set(resource.sharedDocumentIds)
      items = items.filter((item) => allowed.has(item.id))
    }
    return sortKnowledgeFilePanelItems(items, sortField, false)
  }, [documents.items, resource.sharedDocumentIds, sortField])

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
        documents.loading && panelDocuments.length === 0 ? (
          <p className="tm-kb-file-panel-empty">加载文件中…</p>
        ) : panelDocuments.length === 0 ? (
          <p className="tm-kb-file-panel-empty">暂无共享文档</p>
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
            onOpenGroupNote={onOpenGroupNote}
            onOpenGroupKnowledgeMarkdown={onOpenGroupKnowledgeMarkdown}
            onOpenFileMenu={onOpenFileMenu}
            onOpenError={onOpenError}
            onContextMenu={onContextMenu}
          />
        )
      ) : null}
    </section>
  )
}
