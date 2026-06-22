import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KnowledgeBase, P2pSharedResource } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupKnowledgePickerModal } from './GroupKnowledgePickerModal'
import { GroupFileContextMenu } from './GroupFileList'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { useRegisterGroupPanelError } from './group-page-status'
import { GroupSharedKnowledgeSection, type GroupKnowledgeSavedDocumentRegistry } from './GroupSharedKnowledgeSection'
import {
  ensureGroupKnowledgeDocumentSaved,
  removeGroupKnowledgeSavedDocuments,
} from './group-knowledge-file-save'
import {
  knowledgeSelectionKey,
  parseKnowledgeSelectionKey,
} from './group-knowledge-selection'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest } from './group-note-open'
import { useP2pKnowledge } from './useP2pKnowledge'
import { createGroupPanelRefreshHandler } from './group-p2p-sync-policy'
import { hasShareableKnowledgeBases } from './group-knowledge-picker-utils'

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
  onKnowledgeBasesChanged?: () => void | Promise<void>
}

interface PendingDelete {
  kind: 'kb' | 'documents' | 'saved-documents' | 'saved-section'
  groups: Array<{ resourceId: string; documentIds: string[] }>
  savedGroups?: Array<{
    resourceId: string
    workspaceId: string
    savedKbId: string
    savedDocumentIds: string[]
  }>
  message: string
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
  onKnowledgeBasesChanged,
}: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [removingKbId, setRemovingKbId] = useState<string | null>(null)
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [sectionKeysMap, setSectionKeysMap] = useState<Record<string, string[]>>({})
  const [savedDocRegistry, setSavedDocRegistry] = useState<
    Record<string, GroupKnowledgeSavedDocumentRegistry>
  >({})
  const [savedDocumentOverrides, setSavedDocumentOverrides] = useState<
    Record<string, Record<string, { savedDocumentId: string; absolutePath: string }>>
  >({})
  const p2pKnowledge = useP2pKnowledge({ workspaceId: p2pWorkspaceId })

  useRegisterGroupPanelError('knowledge', p2pKnowledge.error, () => p2pKnowledge.setError(null))

  const handleRefresh = useMemo(
    () => createGroupPanelRefreshHandler(p2pWorkspaceId, () => p2pKnowledge.load()),
    [p2pKnowledge.load, p2pWorkspaceId],
  )

  const hasShareableKnowledge = useMemo(
    () => hasShareableKnowledgeBases(knowledgeBases, p2pKnowledge.sharedResources),
    [knowledgeBases, p2pKnowledge.sharedResources],
  )

  const canDeleteResource = useCallback(
    (resource: { sharedBy: string }) =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        (selfMemberId != null && resource.sharedBy === selfMemberId)),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
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

  const handleSavedDocumentRegistryChange = useCallback(
    (resourceId: string, registry: GroupKnowledgeSavedDocumentRegistry | null) => {
      setSavedDocRegistry((current) => {
        const next = { ...current }
        if (registry) {
          next[resourceId] = registry
        } else {
          delete next[resourceId]
        }
        return next
      })
    },
    [],
  )

  const resolveSavedDocumentIds = useCallback(
    (resourceId: string, p2pDocumentIds: string[]): string[] => {
      const registry = savedDocRegistry[resourceId]
      if (!registry) return []
      return p2pDocumentIds
        .map((documentId) => registry.savedByP2pDocumentId[documentId])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    },
    [savedDocRegistry],
  )

  const requestRemoveSavedDocuments = useCallback(
    (resourceId: string, p2pDocumentIds: string[]) => {
      const registry = savedDocRegistry[resourceId]
      if (!registry) {
        p2pKnowledge.setError('暂无可移除的已保存文件')
        return
      }

      const savedDocumentIds = resolveSavedDocumentIds(resourceId, p2pDocumentIds)
      if (savedDocumentIds.length === 0) {
        p2pKnowledge.setError('所选文件尚未保存至共享知识库')
        return
      }

      const preview =
        savedDocumentIds.length > 2
          ? `${savedDocumentIds.length} 个已保存文件`
          : `${savedDocumentIds.length} 个已保存文件`

      setPendingDelete({
        kind: 'saved-documents',
        groups: [{ resourceId, documentIds: p2pDocumentIds }],
        savedGroups: [
          {
            resourceId,
            workspaceId: registry.workspaceId,
            savedKbId: registry.savedKbId,
            savedDocumentIds,
          },
        ],
        message: `确定从共享知识库中移除${preview}吗？群组中的共享列表不会受影响。`,
      })
    },
    [p2pKnowledge, resolveSavedDocumentIds, savedDocRegistry],
  )

  const requestRemoveSavedSection = useCallback(
    (resourceId: string) => {
      const registry = savedDocRegistry[resourceId]
      if (!registry) {
        p2pKnowledge.setError('暂无可移除的已保存文件')
        return
      }

      const savedDocumentIds = Object.values(registry.savedByP2pDocumentId)
      if (savedDocumentIds.length === 0) {
        p2pKnowledge.setError('该知识库下暂无已保存文件')
        return
      }

      setPendingDelete({
        kind: 'saved-section',
        groups: [{ resourceId, documentIds: [] }],
        savedGroups: [
          {
            resourceId,
            workspaceId: registry.workspaceId,
            savedKbId: registry.savedKbId,
            savedDocumentIds,
          },
        ],
        message: `确定从共享知识库中移除该文件夹下全部 ${savedDocumentIds.length} 个已保存文件吗？群组中的共享列表不会受影响。`,
      })
    },
    [p2pKnowledge, savedDocRegistry],
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

    if (current.kind === 'saved-documents' || current.kind === 'saved-section') {
      setRemovingDocumentId(current.groups[0]?.documentIds[0] ?? null)
      p2pKnowledge.setError(null)

      for (const group of current.savedGroups ?? []) {
        const result = await removeGroupKnowledgeSavedDocuments(
          group.workspaceId,
          group.savedKbId,
          group.savedDocumentIds,
        )
        if (result.error) {
          p2pKnowledge.setError(result.error)
          setRemovingDocumentId(null)
          return
        }
      }

      setRemovingDocumentId(null)
      setSavedDocumentOverrides((current) => {
        const next = { ...current }
        for (const group of current.groups) {
          const resourceOverrides = { ...next[group.resourceId] }
          for (const documentId of group.documentIds) {
            delete resourceOverrides[documentId]
          }
          if (Object.keys(resourceOverrides).length === 0) {
            delete next[group.resourceId]
          } else {
            next[group.resourceId] = resourceOverrides
          }
        }
        return next
      })
      setSelectedKeys((keys) => {
        const next = new Set(keys)
        for (const group of current.groups) {
          for (const documentId of group.documentIds) {
            next.delete(knowledgeSelectionKey(group.resourceId, documentId))
          }
        }
        return next
      })
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

    const groupRemoveEntries: Array<{ resourceId: string; documentIds: string[] }> = []
    const savedRemoveEntries: Array<{ resourceId: string; documentIds: string[] }> = []

    for (const [resourceId, documentIds] of grouped.entries()) {
      const resource = p2pKnowledge.sharedResources.find((item) => item.id === resourceId)
      if (resource && canDeleteResource(resource)) {
        groupRemoveEntries.push({ resourceId, documentIds })
      } else {
        savedRemoveEntries.push({ resourceId, documentIds })
      }
    }

    if (groupRemoveEntries.length > 0 && savedRemoveEntries.length > 0) {
      p2pKnowledge.setError('请分别操作群组移除与已保存副本移除')
      return
    }

    if (savedRemoveEntries.length > 0) {
      if (savedRemoveEntries.length === 1) {
        const [entry] = savedRemoveEntries
        requestRemoveSavedDocuments(entry!.resourceId, entry!.documentIds)
        return
      }

      const savedGroups = savedRemoveEntries.flatMap((entry) => {
        const registry = savedDocRegistry[entry.resourceId]
        if (!registry) return []
        const savedDocumentIds = resolveSavedDocumentIds(entry.resourceId, entry.documentIds)
        if (savedDocumentIds.length === 0) return []
        return [
          {
            resourceId: entry.resourceId,
            workspaceId: registry.workspaceId,
            savedKbId: registry.savedKbId,
            savedDocumentIds,
          },
        ]
      })

      if (savedGroups.length === 0) {
        p2pKnowledge.setError('所选文件尚未保存至共享知识库')
        return
      }

      const total = savedGroups.reduce((sum, group) => sum + group.savedDocumentIds.length, 0)
      setPendingDelete({
        kind: 'saved-documents',
        groups: savedRemoveEntries,
        savedGroups,
        message: `确定从共享知识库中移除已勾选的 ${total} 个已保存文件吗？群组中的共享列表不会受影响。`,
      })
      return
    }

    if (groupRemoveEntries.length === 1) {
      const [entry] = groupRemoveEntries
      requestRemoveDocuments(entry!.resourceId, entry!.documentIds)
      return
    }

    const total = groupRemoveEntries.reduce((sum, entry) => sum + entry.documentIds.length, 0)
    setPendingDelete({
      kind: 'documents',
      groups: groupRemoveEntries,
      message: `确定从群组中移除已勾选的 ${total} 个文件吗？`,
    })
  }, [
    canDeleteResource,
    p2pKnowledge,
    requestRemoveDocuments,
    requestRemoveSavedDocuments,
    resolveSavedDocumentIds,
    savedDocRegistry,
    selectedKeys,
  ])

  const deleteSelectedLabel = useMemo(() => {
    const hasGroupDelete = p2pKnowledge.sharedResources.some((resource) =>
      canDeleteResource(resource),
    )
    return hasGroupDelete ? '移除已勾选' : '移除已保存'
  }, [canDeleteResource, p2pKnowledge.sharedResources])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canWriteWorkspace) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [canWriteWorkspace],
  )

  const handleEnsureDocumentSaved = useCallback(
    async (resource: P2pSharedResource, documentId: string) => {
      const result = await ensureGroupKnowledgeDocumentSaved(
        p2pWorkspaceId,
        resource.id,
        documentId,
      )
      if ('error' in result) {
        p2pKnowledge.setError(result.error)
        return null
      }

      setSavedDocumentOverrides((current) => ({
        ...current,
        [resource.id]: {
          ...current[resource.id],
          [documentId]: {
            savedDocumentId: result.savedDocumentId,
            absolutePath: result.absolutePath,
          },
        },
      }))
      await onKnowledgeBasesChanged?.()
      return result
    },
    [onKnowledgeBasesChanged, p2pKnowledge, p2pWorkspaceId],
  )

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title="群组知识库"
        subtitle={`${workspaceName} · ${p2pKnowledge.sharedResources.length} 个知识库`}
        actions={
          <GroupPanelRefreshButton
            loading={p2pKnowledge.loading}
            onRefresh={() => void handleRefresh()}
          />
        }
      />

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
            {p2pKnowledge.sharedResources.map((resource) => {
              const isResourceOwner =
                selfMemberId != null && resource.sharedBy === selfMemberId
              return (
              <GroupSharedKnowledgeSection
                key={resource.id}
                p2pWorkspaceId={p2pWorkspaceId}
                sourceWorkspaceId={sourceWorkspaceId}
                workspaceName={workspaceName}
                resource={resource}
                isResourceOwner={isResourceOwner}
                savedDocumentOverrides={savedDocumentOverrides[resource.id]}
                selectedKeys={selectedKeys}
                canRemoveFromGroup={canDeleteResource(resource)}
                canRemoveSaved={canWriteWorkspace && !isResourceOwner}
                canSelect={canWriteWorkspace}
                removingKb={removingKbId === resource.id}
                removingDocumentId={removingDocumentId}
                onToggleSelect={handleToggleSelect}
                onToggleSelectSection={handleToggleSelectSection}
                onRemoveFromGroupKb={() => requestRemoveKb(resource.id)}
                onRemoveFromGroupDocument={(documentId) =>
                  handleRemoveDocument(resource.id, documentId)
                }
                onRequestRemoveSavedDocuments={(documentIds) =>
                  requestRemoveSavedDocuments(resource.id, documentIds)
                }
                onRequestRemoveSavedSection={() => requestRemoveSavedSection(resource.id)}
                onSavedDocumentRegistryChange={handleSavedDocumentRegistryChange}
                onOpenNote={onOpenNote}
                onOpenGroupNote={onOpenGroupNote}
                onOpenGroupKnowledgeMarkdown={onOpenGroupKnowledgeMarkdown}
                onEnsureDocumentSaved={(documentId) =>
                  handleEnsureDocumentSaved(resource, documentId)
                }
                onOpenError={(message) => p2pKnowledge.setError(message)}
                onContextMenu={handleContextMenu}
                onSectionKeysChange={handleSectionKeysChange}
              />
            )})}
          </div>
        )}
      </div>

      {contextMenu ? (
        <GroupFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedKeys.size}
          enabled={canWriteWorkspace}
          canDelete={selectedKeys.size > 0}
          deleteLabel={deleteSelectedLabel}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={
            pendingDelete.kind === 'kb'
              ? '移除知识库'
              : pendingDelete.kind === 'saved-documents' ||
                  pendingDelete.kind === 'saved-section'
                ? '移除已保存副本'
                : '移除共享文件'
          }
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
    </div>
  )
}
