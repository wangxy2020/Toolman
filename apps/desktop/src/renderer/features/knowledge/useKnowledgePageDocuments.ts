import type { KnowledgePageProps } from './knowledge-page-types'
import type { UseKnowledgePageStateResult } from './useKnowledgePageState'
import { useKnowledgePageDocumentsList } from './useKnowledgePageDocumentsList'
import { useKnowledgePageDocumentsMutate } from './useKnowledgePageDocumentsMutate'
import { useKnowledgePageDocumentsSelection } from './useKnowledgePageDocumentsSelection'

export function useKnowledgePageDocuments(
  props: KnowledgePageProps,
  state: UseKnowledgePageStateResult,
) {
  const list = useKnowledgePageDocumentsList(props, state)
  const selection = useKnowledgePageDocumentsSelection(props, state, list)
  const mutate = useKnowledgePageDocumentsMutate(props, state, list, selection)

  return {
    documents: list.documents,
    selectedIds: selection.selectedIds,
    contextMenu: selection.contextMenu,
    setContextMenu: selection.setContextMenu,
    panelDocuments: list.panelDocuments,
    chatAttachableFiles: selection.chatAttachableFiles,
    panelLoading: list.panelLoading,
    statusFallback: list.statusFallback,
    statusPriority: list.statusPriority,
    statusMeta: list.statusMeta,
    syncMoveTargets: list.syncMoveTargets,
    showDefaultSyncTarget: list.showDefaultSyncTarget,
    handleChatWithFiles: selection.handleChatWithFiles,
    handleToggleSelect: selection.handleToggleSelect,
    handleSelectAll: selection.handleSelectAll,
    handleClearSelection: selection.handleClearSelection,
    handleSortFieldChange: selection.handleSortFieldChange,
    handleDeleteDocument: mutate.handleDeleteDocument,
    handleDeleteSelected: mutate.handleDeleteSelected,
    handleImportFiles: mutate.handleImportFiles,
    handleAddUrl: mutate.handleAddUrl,
    handleAddSitemap: mutate.handleAddSitemap,
    handleReindexAll: mutate.handleReindexAll,
    handleMoveToSync: mutate.handleMoveToSync,
    handleContextMenu: selection.handleContextMenu,
    confirmDeleteDocuments: mutate.confirmDeleteDocuments,
    onChatWithKnowledgeFiles: props.onChatWithKnowledgeFiles,
  }
}
