import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KnowledgeBase } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupKnowledgePickerModal } from './GroupKnowledgePickerModal'
import { GroupFileContextMenu } from './GroupFileList'
import { GroupKnowledgeFileActionMenu } from './GroupKnowledgeFileActionMenu'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { GroupSharedKnowledgeSection } from './GroupSharedKnowledgeSection'
import { saveGroupKnowledgeFileAsCopy } from './group-knowledge-file-save'
import {
  knowledgeSelectionKey,
  parseKnowledgeSelectionKey,
} from './group-knowledge-selection'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest, SaveGroupNoteAsCopyRequest } from './group-note-open'
import { resolveNoteIdFromKnowledgeDocument } from '../knowledge/knowledge-note-link'
import type { KnowledgeFilePanelItem } from '../knowledge/KnowledgeBaseFilePanel'
import { useP2pKnowledge } from './useP2pKnowledge'

interface Props {
  p2pWorkspaceId: string
  workspaceName: string
  sourceWorkspaceId: string | null
  knowledgeBases: KnowledgeBase[]
  canManageGroupResources: boolean
  canWriteWorkspace: boolean
  selfMemberId: string | null
  onOpenNote?: (noteId: string) => boolean
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenGroupKnowledgeMarkdown?: (
    request: OpenGroupKnowledgeMarkdownRequest,
  ) => void | Promise<void>
  onSaveGroupNoteAsCopy?: (request: SaveGroupNoteAsCopyRequest) => void | Promise<void>
}

interface PendingDelete {
  kind: 'kb' | 'documents'
  groups: Array<{ resourceId: string; documentIds: string[] }>
  message: string
}

interface FileActionMenuState {
  x: number
  y: number
  align: 'bottom-start'
  doc: KnowledgeFilePanelItem
}

export function GroupKnowledgePanel({
  p2pWorkspaceId,
  workspaceName,
  sourceWorkspaceId,
  knowledgeBases,
  canManageGroupResources,
  canWriteWorkspace,
  selfMemberId,
  onOpenNote,
  onOpenGroupNote,
  onOpenGroupKnowledgeMarkdown,
  onSaveGroupNoteAsCopy,
}: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [removingKbId, setRemovingKbId] = useState<string | null>(null)
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [fileActionMenu, setFileActionMenu] = useState<FileActionMenuState | null>(null)
  const [sectionKeysMap, setSectionKeysMap] = useState<Record<string, string[]>>({})
  const p2pKnowledge = useP2pKnowledge({ workspaceId: p2pWorkspaceId })

  useEffect(() => {
    void p2pKnowledge.load()
  }, [p2pKnowledge.load])

  useEffect(() => {
    const handleKnowledgeEvent = (payload: unknown) => {
      const event = payload as { workspaceId?: string; resourceType?: string }
      if (event.workspaceId !== p2pWorkspaceId || event.resourceType !== 'Knowledge') return
      void p2pKnowledge.load()
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleKnowledgeEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleKnowledgeEvent)

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
    }
  }, [p2pKnowledge.load, p2pWorkspaceId])

  const hasShareableKnowledge = useMemo(
    () =>
      knowledgeBases.some((kb) => {
        const resource = p2pKnowledge.sharedResources.find(
          (item) => (item.localResourceId ?? item.id) === kb.id,
        )
        if (!resource) return true
        if (!resource.sharedDocumentIds) return false
        return kb.documentCount > resource.sharedDocumentIds.length
      }),
    [knowledgeBases, p2pKnowledge.sharedResources],
  )

  const canDeleteResource = useCallback(
    (resource: { sharedBy: string }) =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        (selfMemberId != null && resource.sharedBy === selfMemberId)),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const canManageKnowledge = useMemo(
    () =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        p2pKnowledge.sharedResources.some((resource) => canDeleteResource(resource))),
    [canDeleteResource, canManageGroupResources, canWriteWorkspace, p2pKnowledge.sharedResources],
  )

  const handleAddKnowledgeBases = useCallback(
    async (
      selections: Array<{ knowledgeBaseId: string; documentIds?: string[] }>,
    ) => {
      if (!sourceWorkspaceId) {
        throw new Error('工作区未就绪')
      }

      for (const selection of selections) {
        const ok = await p2pKnowledge.shareKnowledgeBase(
          selection.knowledgeBaseId,
          sourceWorkspaceId,
          selection.documentIds,
        )
        if (!ok) {
          throw new Error(p2pKnowledge.error ?? '添加知识库失败')
        }
      }

      await p2pKnowledge.load()
    },
    [p2pKnowledge, sourceWorkspaceId],
  )

  const handleToggleSelect = useCallback((selectionKey: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(selectionKey)) next.delete(selectionKey)
      else next.add(selectionKey)
      return next
    })
  }, [])

  const handleToggleSelectSection = useCallback((selectionKeys: string[]) => {
    setSelectedKeys((current) => {
      const allSelected =
        selectionKeys.length > 0 && selectionKeys.every((key) => current.has(key))
      const next = new Set(current)
      if (allSelected) {
        for (const key of selectionKeys) next.delete(key)
      } else {
        for (const key of selectionKeys) next.add(key)
      }
      return next
    })
  }, [])

  const requestRemoveKb = useCallback(
    (resourceId: string) => {
      const resource = p2pKnowledge.sharedResources.find((item) => item.id === resourceId)
      if (!resource || !canDeleteResource(resource)) {
        p2pKnowledge.setError('无权移除该知识库')
        return
      }

      setPendingDelete({
        kind: 'kb',
        groups: [{ resourceId, documentIds: [] }],
        message: `确定从群组中移除知识库「${resource.name}」吗？`,
      })
    },
    [canDeleteResource, p2pKnowledge],
  )

  const requestRemoveDocuments = useCallback(
    (resourceId: string, documentIds: string[]) => {
      const resource = p2pKnowledge.sharedResources.find((item) => item.id === resourceId)
      if (!resource || !canDeleteResource(resource)) {
        p2pKnowledge.setError('无权移除所选文件')
        return
      }

      const suffix =
        documentIds.length > 2
          ? ` 等 ${documentIds.length} 个文件`
          : documentIds.length > 1
            ? ''
            : ''
      const preview =
        documentIds.length > 2
          ? `${documentIds.length} 个文件`
          : `${documentIds.length} 个共享文件`

      setPendingDelete({
        kind: 'documents',
        groups: [{ resourceId, documentIds }],
        message: `确定从群组知识库「${resource.name}」中移除${preview}${suffix}吗？`,
      })
    },
    [canDeleteResource, p2pKnowledge],
  )

  const handleRemoveDocument = useCallback(
    (resourceId: string, documentId: string) => {
      requestRemoveDocuments(resourceId, [documentId])
    },
    [requestRemoveDocuments],
  )

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return

    const current = pendingDelete
    setPendingDelete(null)

    if (current.kind === 'kb') {
      const resourceId = current.groups[0]?.resourceId
      if (!resourceId) return

      setRemovingKbId(resourceId)
      await p2pKnowledge.unshareKnowledgeBase(resourceId)
      setRemovingKbId(null)
      setSelectedKeys((keys) => {
        const next = new Set(keys)
        for (const key of keys) {
          if (key.startsWith(`${resourceId}:`)) next.delete(key)
        }
        return next
      })
      await p2pKnowledge.load()
      return
    }

    setRemovingDocumentId(current.groups[0]?.documentIds[0] ?? null)
    p2pKnowledge.setError(null)

    for (const group of current.groups) {
      const ok = await p2pKnowledge.removeDocuments(group.resourceId, group.documentIds)
      if (!ok) {
        setRemovingDocumentId(null)
        await p2pKnowledge.load()
        return
      }
    }

    setRemovingDocumentId(null)
    setSelectedKeys((keys) => {
      const next = new Set(keys)
      for (const group of current.groups) {
        for (const documentId of group.documentIds) {
          next.delete(knowledgeSelectionKey(group.resourceId, documentId))
        }
      }
      return next
    })
    await p2pKnowledge.load()
  }, [pendingDelete, p2pKnowledge])

  const handleSectionKeysChange = useCallback((resourceId: string, keys: string[]) => {
    setSectionKeysMap((current) => ({ ...current, [resourceId]: keys }))
  }, [])

  const handleSelectAll = useCallback(() => {
    const next = new Set<string>()
    for (const keys of Object.values(sectionKeysMap)) {
      for (const key of keys) next.add(key)
    }
    setSelectedKeys(next)
  }, [sectionKeysMap])

  const handleClearSelection = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  const handleDeleteSelected = useCallback(() => {
    const grouped = new Map<string, string[]>()
    for (const key of selectedKeys) {
      const parsed = parseKnowledgeSelectionKey(key)
      if (!parsed) continue
      const bucket = grouped.get(parsed.resourceId) ?? []
      bucket.push(parsed.documentId)
      grouped.set(parsed.resourceId, bucket)
    }

    if (grouped.size === 0) return

    if (grouped.size === 1) {
      const [resourceId, documentIds] = [...grouped.entries()][0]!
      requestRemoveDocuments(resourceId, documentIds)
      return
    }

    const total = [...grouped.values()].reduce((sum, ids) => sum + ids.length, 0)
    setPendingDelete({
      kind: 'documents',
      groups: [...grouped.entries()].map(([resourceId, documentIds]) => ({
        resourceId,
        documentIds,
      })),
      message: `确定从群组中移除已勾选的 ${total} 个文件吗？`,
    })
  }, [requestRemoveDocuments, selectedKeys])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canManageKnowledge) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [canManageKnowledge],
  )

  const handleSaveFileAsCopy = useCallback(
    async (doc: KnowledgeFilePanelItem) => {
      const isUrlDoc = doc.sourceKind === 'url'
      const noteId = !isUrlDoc ? resolveNoteIdFromKnowledgeDocument(doc) : null

      if (noteId) {
        await onSaveGroupNoteAsCopy?.({ noteId, title: doc.title })
        return
      }

      if (isUrlDoc && doc.absolutePath) {
        window.open(doc.absolutePath, '_blank', 'noopener,noreferrer')
        return
      }

      if (doc.absolutePath && !/^https?:\/\//i.test(doc.absolutePath)) {
        await saveGroupKnowledgeFileAsCopy(doc.absolutePath, doc.title)
        return
      }

      p2pKnowledge.setError('无法另存为该文件')
    },
    [onSaveGroupNoteAsCopy, p2pKnowledge],
  )

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title="群组知识库"
        subtitle={`${workspaceName} · ${p2pKnowledge.sharedResources.length} 个知识库`}
        actions={
          <GroupPanelRefreshButton
            loading={p2pKnowledge.loading}
            onRefresh={() => void p2pKnowledge.load()}
          />
        }
      />

      {p2pKnowledge.error ? <div className="tm-error-bar">{p2pKnowledge.error}</div> : null}

      <div className="tm-kb-file-panel" onContextMenu={handleContextMenu}>
        <button
          type="button"
          className="tm-kb-file-dropzone"
          disabled={
            p2pKnowledge.sharing ||
            !sourceWorkspaceId ||
            !canWriteWorkspace ||
            !hasShareableKnowledge
          }
          onClick={() => setShowPicker(true)}
        >
          <span className="tm-kb-file-dropzone-title">
            {p2pKnowledge.sharing ? '正在添加知识库…' : '点击添加知识库到群组'}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            从已有知识库中选择，共享给群组成员
          </span>
        </button>

        {p2pKnowledge.loading && p2pKnowledge.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>加载知识库列表中…</p>
          </div>
        ) : p2pKnowledge.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>暂无共享知识库，点击上方区域添加</p>
          </div>
        ) : (
          <div className="tm-group-shared-knowledge-list">
            {p2pKnowledge.sharedResources.map((resource) => (
              <GroupSharedKnowledgeSection
                key={resource.id}
                p2pWorkspaceId={p2pWorkspaceId}
                sourceWorkspaceId={sourceWorkspaceId}
                workspaceName={workspaceName}
                resource={resource}
                selectedKeys={selectedKeys}
                canDelete={canDeleteResource(resource)}
                removingKb={removingKbId === resource.id}
                removingDocumentId={removingDocumentId}
                onToggleSelect={handleToggleSelect}
                onToggleSelectSection={handleToggleSelectSection}
                onRemoveKb={() => requestRemoveKb(resource.id)}
                onRemoveDocument={(documentId) => handleRemoveDocument(resource.id, documentId)}
                onOpenNote={onOpenNote}
                onOpenGroupNote={onOpenGroupNote}
                onOpenGroupKnowledgeMarkdown={onOpenGroupKnowledgeMarkdown}
                onOpenFileMenu={(doc, anchor) => setFileActionMenu({ ...anchor, doc })}
                onOpenError={(message) => p2pKnowledge.setError(message)}
                onContextMenu={handleContextMenu}
                onSectionKeysChange={handleSectionKeysChange}
              />
            ))}
          </div>
        )}
      </div>

      {contextMenu ? (
        <GroupFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedKeys.size}
          canDelete={canManageKnowledge}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={pendingDelete.kind === 'kb' ? '移除知识库' : '移除共享文件'}
          message={pendingDelete.message}
          confirmLabel="移除"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {showPicker ? (
        <GroupKnowledgePickerModal
          knowledgeBases={knowledgeBases}
          sharedResources={p2pKnowledge.sharedResources}
          sourceWorkspaceId={sourceWorkspaceId}
          onClose={() => setShowPicker(false)}
          onConfirm={handleAddKnowledgeBases}
        />
      ) : null}

      {fileActionMenu ? (
        <GroupKnowledgeFileActionMenu
          x={fileActionMenu.x}
          y={fileActionMenu.y}
          align={fileActionMenu.align}
          onClose={() => setFileActionMenu(null)}
          onSaveAs={() => void handleSaveFileAsCopy(fileActionMenu.doc)}
        />
      ) : null}
    </div>
  )
}
