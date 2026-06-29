import { useCallback } from 'react'
import {
  buildNoteDeletePreview,
  collectAllResourceIds,
  resolveNotebookNameForDelete,
} from './group-notes-panel-utils'
import type { UseGroupNotesPanelStateResult } from './useGroupNotesPanelState'

export function useGroupNotesPanelDelete(state: UseGroupNotesPanelStateResult) {
  const {
    t,
    p2pNotes,
    notesById,
    notebooksById,
    selectedIds,
    setSelectedIds,
    setRemovingId,
    setRemovingNotebookId,
    pendingDelete,
    setPendingDelete,
    canDeleteResource,
    flatNotebookSections,
    sectionKeysMap,
    canManageNotes,
    setContextMenu,
  } = state

  const requestDelete = useCallback(
    (resourceIds: string[], message?: string) => {
      const deletableIds = resourceIds.filter((id) => {
        const resource = p2pNotes.sharedResources.find((item) => item.id === id)
        return resource ? canDeleteResource(resource) : false
      })

      if (deletableIds.length === 0) {
        p2pNotes.setError(t('groupPage.confirm.errors.noPermissionNotes'))
        return
      }

      if (message) {
        setPendingDelete({ resourceIds: deletableIds, message })
        return
      }

      const { preview, suffix } = buildNoteDeletePreview(
        deletableIds,
        p2pNotes.sharedResources,
        notesById,
      )

      setPendingDelete({
        resourceIds: deletableIds,
        message: t('groupPage.confirm.notes.removeNote', { preview, suffix }),
      })
    },
    [canDeleteResource, notesById, p2pNotes, setPendingDelete, t],
  )

  const requestRemoveNotebook = useCallback(
    (notebookId: string, resourceIds: string[]) => {
      const notebookName = resolveNotebookNameForDelete(
        notebookId,
        p2pNotes.sharedResources,
        notesById,
        notebooksById,
      )
      const deletableCount = resourceIds.filter((id) => {
        const resource = p2pNotes.sharedResources.find((item) => item.id === id)
        return resource ? canDeleteResource(resource) : false
      }).length

      if (deletableCount === 0) {
        p2pNotes.setError(t('groupPage.confirm.errors.noPermissionNotebook'))
        return
      }

      requestDelete(
        resourceIds,
        t('groupPage.confirm.notes.removeNotebook', {
          name: notebookName,
          count: deletableCount,
        }),
      )
    },
    [canDeleteResource, notebooksById, notesById, p2pNotes, requestDelete, t],
  )

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return

    const { resourceIds } = pendingDelete
    setPendingDelete(null)
    setRemovingId(resourceIds[0] ?? null)
    setRemovingNotebookId(
      flatNotebookSections.find((section) =>
        section.items.some((item) => resourceIds.includes(item.resource.id)),
      )?.sectionKey ?? null,
    )
    p2pNotes.setError(null)

    for (const resourceId of resourceIds) {
      const ok = await p2pNotes.unshareNote(resourceId)
      if (!ok) {
        setRemovingId(null)
        setRemovingNotebookId(null)
        await p2pNotes.load()
        return
      }
    }

    setRemovingId(null)
    setRemovingNotebookId(null)
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of resourceIds) next.delete(id)
      return next
    })
    await p2pNotes.load()
  }, [
    flatNotebookSections,
    pendingDelete,
    p2pNotes,
    setPendingDelete,
    setRemovingId,
    setRemovingNotebookId,
    setSelectedIds,
  ])

  const handleRemoveNote = useCallback(
    (resourceId: string) => {
      requestDelete([resourceId])
    },
    [requestDelete],
  )

  const handleSelectAll = useCallback(() => {
    setSelectedIds(collectAllResourceIds(sectionKeysMap))
  }, [sectionKeysMap, setSelectedIds])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [setSelectedIds])

  const handleDeleteSelected = useCallback(() => {
    requestDelete(Array.from(selectedIds))
  }, [requestDelete, selectedIds])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canManageNotes) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [canManageNotes, setContextMenu],
  )

  return {
    requestDelete,
    requestRemoveNotebook,
    confirmDelete,
    handleRemoveNote,
    handleSelectAll,
    handleClearSelection,
    handleDeleteSelected,
    handleContextMenu,
  }
}
