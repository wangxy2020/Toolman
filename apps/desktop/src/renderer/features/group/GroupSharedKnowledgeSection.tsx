import { useCallback, useEffect, useMemo, useState } from 'react'
import { stripP2pGroupPrefixedResourceName, type P2pSharedResource } from '@toolman/shared'
import { GroupKnowledgeFileList } from './GroupKnowledgeFileList'
import { knowledgeSelectionKey } from './group-knowledge-selection'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest } from './group-note-open'
import { useSharedKnowledgePanelDocuments } from './useSharedKnowledgePanelDocuments'
import { materializeGroupKnowledgeDocument } from './group-knowledge-file-save'
import { GroupSharedKnowledgeSectionHeader } from './GroupSharedKnowledgeSectionHeader'

export interface GroupKnowledgeSavedDocumentRegistry {
  workspaceId: string
  savedKbId: string
  savedByP2pDocumentId: Record<string, string>
}

interface Props {
  p2pWorkspaceId: string
  sourceWorkspaceId: string | null
  workspaceName: string
  resource: P2pSharedResource
  sectionTitle?: string
  isResourceOwner: boolean
  savedDocumentOverrides?: Record<string, { savedDocumentId: string; absolutePath: string }>
  selectedKeys: Set<string>
  canRemoveFromGroup: boolean
  canRemoveSaved: boolean
  canSelect: boolean
  removingKb?: boolean
  removingDocumentId?: string | null
  onToggleSelect: (selectionKey: string) => void
  onToggleSelectSection: (selectionKeys: string[]) => void
  onRemoveFromGroupKb: () => void
  onRemoveFromGroupDocument: (documentId: string) => void
  onRequestRemoveSavedDocuments: (documentIds: string[]) => void
  onRequestRemoveSavedSection: () => void
  onSavedDocumentRegistryChange?: (
    resourceId: string,
    registry: GroupKnowledgeSavedDocumentRegistry | null,
  ) => void
  onOpenNote?: (noteId: string) => boolean
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenGroupKnowledgeMarkdown?: (
    request: OpenGroupKnowledgeMarkdownRequest,
  ) => void | Promise<void>
  onEnsureDocumentSaved?: (
    documentId: string,
    currentPath?: string | null,
  ) => Promise<{ absolutePath: string; savedDocumentId: string } | null>
  onOpenError?: (message: string) => void
  onContextMenu?: (event: React.MouseEvent) => void
  onSectionKeysChange?: (resourceId: string, keys: string[]) => void
}

export function GroupSharedKnowledgeSection({
  p2pWorkspaceId,
  sourceWorkspaceId: _sourceWorkspaceId,
  workspaceName,
  resource,
  sectionTitle,
  isResourceOwner,
  savedDocumentOverrides,
  selectedKeys,
  canRemoveFromGroup,
  canRemoveSaved,
  canSelect,
  removingKb,
  removingDocumentId,
  onToggleSelect,
  onToggleSelectSection,
  onRemoveFromGroupKb,
  onRemoveFromGroupDocument,
  onRequestRemoveSavedDocuments,
  onRequestRemoveSavedSection,
  onSavedDocumentRegistryChange,
  onOpenNote,
  onOpenGroupNote,
  onOpenGroupKnowledgeMarkdown,
  onEnsureDocumentSaved,
  onOpenError,
  onContextMenu,
  onSectionKeysChange,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const kbId = resource.localResourceId ?? resource.id
  const sharedFolderName = useMemo(
    () => stripP2pGroupPrefixedResourceName(workspaceName, resource.name),
    [resource.name, workspaceName],
  )
  const displayName = sectionTitle ?? sharedFolderName
  const { localWorkspaceId, savedGroupKbId, panelDocuments, loading, refresh } =
    useSharedKnowledgePanelDocuments({
      p2pWorkspaceId,
      workspaceName,
      sharedFolderName,
      kbId,
      sharedDocumentIds: resource.sharedDocumentIds,
      isResourceOwner,
      savedDocumentOverrides,
    })

  const savedDocumentIds = useMemo(
    () =>
      panelDocuments
        .map((doc) => doc.savedDocumentId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    [panelDocuments],
  )

  useEffect(() => {
    if (!onSavedDocumentRegistryChange) return
    if (!localWorkspaceId || !savedGroupKbId) {
      onSavedDocumentRegistryChange(resource.id, null)
      return
    }

    const savedByP2pDocumentId: Record<string, string> = {}
    for (const doc of panelDocuments) {
      if (doc.savedDocumentId) {
        savedByP2pDocumentId[doc.id] = doc.savedDocumentId
      }
    }

    onSavedDocumentRegistryChange(resource.id, {
      workspaceId: localWorkspaceId,
      savedKbId: savedGroupKbId,
      savedByP2pDocumentId,
    })
  }, [
    localWorkspaceId,
    onSavedDocumentRegistryChange,
    panelDocuments,
    resource.id,
    savedGroupKbId,
  ])

  const handleEnsureDocumentSaved = useCallback(
    async (
      documentId: string,
      currentPath?: string | null,
    ): Promise<{ absolutePath: string; savedDocumentId: string } | null> => {
      const result = await onEnsureDocumentSaved?.(documentId, currentPath)
      if (!result) {
        return null
      }
      await refresh()
      return result
    },
    [onEnsureDocumentSaved, refresh],
  )

  const resolveDocumentPath = useCallback(
    async (documentId: string, currentPath?: string | null): Promise<string | null> => {
      if (currentPath) return currentPath

      const result = await materializeGroupKnowledgeDocument(
        p2pWorkspaceId,
        resource.id,
        documentId,
      )
      if ('error' in result) {
        onOpenError?.(result.error)
        return null
      }
      return result.absolutePath
    },
    [onOpenError, p2pWorkspaceId, resource.id],
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

  const showSectionActions = canRemoveFromGroup || canRemoveSaved || canSelect
  const sectionRemoveTitle = canRemoveFromGroup
    ? '从群组移除知识库'
    : savedDocumentIds.length > 0
      ? '移除全部已保存副本'
      : '暂无可移除的已保存文件'
  const sectionRemoveDisabled = canRemoveFromGroup
    ? removingKb
    : savedDocumentIds.length === 0

  const handleSectionRemove = () => {
    if (canRemoveFromGroup) {
      onRemoveFromGroupKb()
      return
    }
    if (canRemoveSaved && savedDocumentIds.length > 0) {
      onRequestRemoveSavedSection()
    }
  }

  return (
    <section className="tm-group-kb-section">
      <GroupSharedKnowledgeSectionHeader
        expanded={expanded}
        displayName={displayName}
        documentCount={panelDocuments.length}
        showSectionActions={showSectionActions}
        canRemoveFromGroup={canRemoveFromGroup}
        canRemoveSaved={canRemoveSaved}
        canSelect={canSelect}
        sectionRemoveTitle={sectionRemoveTitle}
        sectionRemoveDisabled={Boolean(sectionRemoveDisabled)}
        sectionFullySelected={sectionFullySelected}
        sectionPartiallySelected={sectionPartiallySelected}
        onToggleExpanded={() => setExpanded((current) => !current)}
        onSectionRemove={handleSectionRemove}
        onToggleSelectSection={() => onToggleSelectSection(sectionSelectionKeys)}
      />

      {expanded ? (
        !localWorkspaceId ? (
          <p className="tm-kb-file-panel-empty">工作区未就绪</p>
        ) : loading ? (
          <p className="tm-kb-file-panel-empty">加载文件中…</p>
        ) : panelDocuments.length === 0 ? (
          <p className="tm-kb-file-panel-empty">暂无共享文档</p>
        ) : (
          <GroupKnowledgeFileList
            resourceId={resource.id}
            p2pWorkspaceId={p2pWorkspaceId}
            workspaceName={workspaceName}
            isResourceOwner={isResourceOwner}
            documents={panelDocuments}
            selectedKeys={selectedKeys}
            canRemoveFromGroup={canRemoveFromGroup}
            canRemoveSaved={canRemoveSaved}
            canSelect={canSelect}
            removingDocumentId={removingDocumentId}
            onToggleSelect={onToggleSelect}
            onRemoveFromGroup={onRemoveFromGroupDocument}
            onRemoveSaved={(documentId) => onRequestRemoveSavedDocuments([documentId])}
            onOpenNote={onOpenNote}
            onOpenGroupNote={handleOpenGroupNote}
            onOpenGroupKnowledgeMarkdown={handleOpenGroupKnowledgeMarkdown}
            onMaterializeDocument={isResourceOwner ? resolveDocumentPath : undefined}
            onEnsureDocumentSaved={handleEnsureDocumentSaved}
            onOpenError={onOpenError}
            onContextMenu={onContextMenu}
          />
        )
      ) : null}
    </section>
  )
}
