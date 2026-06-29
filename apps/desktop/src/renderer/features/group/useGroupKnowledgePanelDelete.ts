import { useCallback } from 'react'
import {
  buildDocumentRemovePreview,
  buildSavedDocumentRemovePreview,
  buildSavedGroupsFromEntries,
  groupSelectionKeysByResource,
  partitionDeleteEntries,
  removeSavedDocumentOverrides,
  removeSelectionKeysForDocumentGroups,
  removeSelectionKeysForResource,
  resolveSavedDocumentIds,
} from './group-knowledge-panel-utils'
import { removeGroupKnowledgeSavedDocuments } from './group-knowledge-file-save'
import type { UseGroupKnowledgePanelStateResult } from './useGroupKnowledgePanelState'

export function useGroupKnowledgePanelDelete(state: UseGroupKnowledgePanelStateResult) {
  const {
    t,
    p2pKnowledge,
    selectedKeys,
    setSelectedKeys,
    setRemovingKbId,
    setRemovingDocumentId,
    pendingDelete,
    setPendingDelete,
    savedDocRegistry,
    setSavedDocumentOverrides,
    canDeleteResource,
    resolveResourceLabel,
  } = state

  const requestRemoveKb = useCallback(
    (resourceId: string) => {
      const resource = p2pKnowledge.sharedResources.find((item) => item.id === resourceId)
      if (!resource || !canDeleteResource(resource)) {
        p2pKnowledge.setError(t('groupPage.confirm.errors.noPermissionKb'))
        return
      }

      setPendingDelete({
        kind: 'kb',
        groups: [{ resourceId, documentIds: [] }],
        message: t('groupPage.confirm.knowledge.removeKb', {
          name: resolveResourceLabel(resource),
        }),
      })
    },
    [canDeleteResource, p2pKnowledge, resolveResourceLabel, setPendingDelete, t],
  )

  const requestRemoveDocuments = useCallback(
    (resourceId: string, documentIds: string[]) => {
      const resource = p2pKnowledge.sharedResources.find((item) => item.id === resourceId)
      if (!resource || !canDeleteResource(resource)) {
        p2pKnowledge.setError(t('groupPage.confirm.errors.noPermissionFiles'))
        return
      }

      const { preview, suffix } = buildDocumentRemovePreview(documentIds)

      setPendingDelete({
        kind: 'documents',
        groups: [{ resourceId, documentIds }],
        message: t('groupPage.confirm.knowledge.removeFiles', {
          name: resolveResourceLabel(resource),
          preview,
          suffix,
        }),
      })
    },
    [canDeleteResource, p2pKnowledge, resolveResourceLabel, setPendingDelete, t],
  )

  const requestRemoveSavedDocuments = useCallback(
    (resourceId: string, p2pDocumentIds: string[]) => {
      const registry = savedDocRegistry[resourceId]
      if (!registry) {
        p2pKnowledge.setError(t('groupPage.confirm.errors.noSavedFiles'))
        return
      }

      const savedDocumentIds = resolveSavedDocumentIds(registry, p2pDocumentIds)
      if (savedDocumentIds.length === 0) {
        p2pKnowledge.setError(t('groupPage.confirm.errors.filesNotSaved'))
        return
      }

      const preview = buildSavedDocumentRemovePreview(savedDocumentIds.length)

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
        message: t('groupPage.confirm.knowledge.removeSavedPreview', { preview }),
      })
    },
    [p2pKnowledge, savedDocRegistry, setPendingDelete, t],
  )

  const requestRemoveSavedSection = useCallback(
    (resourceId: string) => {
      const registry = savedDocRegistry[resourceId]
      if (!registry) {
        p2pKnowledge.setError(t('groupPage.confirm.errors.noSavedFiles'))
        return
      }

      const savedDocumentIds = Object.values(registry.savedByP2pDocumentId)
      if (savedDocumentIds.length === 0) {
        p2pKnowledge.setError(t('groupPage.confirm.errors.noSavedFiles'))
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
        message: t('groupPage.confirm.knowledge.removeSavedSection', {
          count: savedDocumentIds.length,
        }),
      })
    },
    [p2pKnowledge, savedDocRegistry, setPendingDelete, t],
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
      setSelectedKeys((keys) => removeSelectionKeysForResource(keys, resourceId))
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
      setSavedDocumentOverrides((overrides) =>
        removeSavedDocumentOverrides(overrides, current.savedGroups ?? []),
      )
      setSelectedKeys((keys) => removeSelectionKeysForDocumentGroups(keys, current.groups))
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
    setSelectedKeys((keys) => removeSelectionKeysForDocumentGroups(keys, current.groups))
    await p2pKnowledge.load()
  }, [
    pendingDelete,
    p2pKnowledge,
    setPendingDelete,
    setRemovingDocumentId,
    setRemovingKbId,
    setSavedDocumentOverrides,
    setSelectedKeys,
  ])

  const handleDeleteSelected = useCallback(() => {
    const grouped = groupSelectionKeysByResource(selectedKeys)
    if (grouped.size === 0) return

    const { groupRemoveEntries, savedRemoveEntries } = partitionDeleteEntries(
      grouped,
      p2pKnowledge.sharedResources,
      canDeleteResource,
    )

    if (groupRemoveEntries.length > 0 && savedRemoveEntries.length > 0) {
      p2pKnowledge.setError(t('groupPage.confirm.errors.mixedRemoveKinds'))
      return
    }

    if (savedRemoveEntries.length > 0) {
      if (savedRemoveEntries.length === 1) {
        const [entry] = savedRemoveEntries
        requestRemoveSavedDocuments(entry!.resourceId, entry!.documentIds)
        return
      }

      const savedGroups = buildSavedGroupsFromEntries(savedRemoveEntries, savedDocRegistry)
      if (savedGroups.length === 0) {
        p2pKnowledge.setError(t('groupPage.confirm.errors.filesNotSaved'))
        return
      }

      const total = savedGroups.reduce((sum, group) => sum + group.savedDocumentIds.length, 0)
      setPendingDelete({
        kind: 'saved-documents',
        groups: savedRemoveEntries,
        savedGroups,
        message: t('groupPage.confirm.knowledge.removeSavedSelected', { count: total }),
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
      message: t('groupPage.confirm.knowledge.removeGroupSelected', { count: total }),
    })
  }, [
    canDeleteResource,
    p2pKnowledge,
    requestRemoveDocuments,
    requestRemoveSavedDocuments,
    savedDocRegistry,
    selectedKeys,
    setPendingDelete,
    t,
  ])

  return {
    requestRemoveKb,
    requestRemoveDocuments,
    requestRemoveSavedDocuments,
    requestRemoveSavedSection,
    handleRemoveDocument,
    confirmDelete,
    handleDeleteSelected,
  }
}
