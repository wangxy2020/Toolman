import { useCallback } from 'react'
import { IpcChannel } from '@toolman/shared'
import type { GroupNoteAction } from './GroupNoteActionMenu'
import type { OpenGroupNoteRequest } from './group-note-open'
import type { GroupNotesPanelProps } from './group-notes-panel-types'
import type { UseGroupNotesPanelStateResult } from './useGroupNotesPanelState'

export function useGroupNotesPanelActions(
  props: GroupNotesPanelProps,
  state: UseGroupNotesPanelStateResult,
) {
  const { syncFolderPath = null, onOpenGroupNote, onSaveGroupNoteAsCopy } = props
  const {
    p2pWorkspaceId,
    workspaceName,
    notebooks,
    notes,
    p2pNotes,
    noteActionMenu,
    setNoteActionMenu,
    canManagePermission,
    resolveEditable,
    setShowPicker,
  } = state

  const handleOpenGroupNote = useCallback(
    (request: OpenGroupNoteRequest) => {
      const resource = p2pNotes.sharedResources.find(
        (item) => (item.localResourceId ?? item.id) === request.noteId,
      )
      const editable = resource ? resolveEditable(resource) : false
      return onOpenGroupNote?.({
        ...request,
        workspaceId: p2pWorkspaceId,
        workspaceName,
        permission: resource?.permission ?? request.permission,
        sharedBy: resource?.sharedBy ?? request.sharedBy,
        editable,
      })
    },
    [
      onOpenGroupNote,
      p2pNotes.sharedResources,
      p2pWorkspaceId,
      resolveEditable,
      workspaceName,
    ],
  )

  const handleNoteAction = useCallback(
    async (action: GroupNoteAction) => {
      if (!noteActionMenu) return

      const { resource, note } = noteActionMenu
      const noteId = resource.localResourceId ?? resource.id
      const title = note?.title ?? resource.name

      if (action === 'save-as') {
        setNoteActionMenu(null)
        await onSaveGroupNoteAsCopy?.({ noteId, title })
        return
      }

      if (!canManagePermission(resource)) return

      if (action === 'read') {
        const ok = await p2pNotes.setNotePermission(resource.id, 'read')
        if (!ok) p2pNotes.setError(p2pNotes.error ?? '设置权限失败')
        return
      }

      if (action === 'edit') {
        const ok = await p2pNotes.setNotePermission(resource.id, 'write')
        if (!ok) p2pNotes.setError(p2pNotes.error ?? '设置权限失败')
      }
    },
    [canManagePermission, noteActionMenu, onSaveGroupNoteAsCopy, p2pNotes, setNoteActionMenu],
  )

  const handleAddNotes = useCallback(
    async (selections: Array<{ notebookId: string; noteIds: string[] }>) => {
      if (selections.length === 0) {
        throw new Error('请先选择要添加的笔记')
      }

      const syncResult = await window.api.invoke(IpcChannel.NotesDataSync, {
        dataJson: JSON.stringify({ notebooks, notes, syncFolderPath }),
      })
      if (!syncResult.ok) {
        throw new Error(syncResult.error.message)
      }

      for (const selection of selections) {
        for (const noteId of selection.noteIds) {
          const ok = await p2pNotes.shareNote(noteId)
          if (!ok) {
            throw new Error(p2pNotes.error ?? '添加笔记失败')
          }
        }
      }
      await p2pNotes.load()
    },
    [notebooks, notes, p2pNotes, syncFolderPath],
  )

  const handleConfirmPicker = useCallback(
    async (selections: Array<{ notebookId: string; noteIds: string[] }>) => {
      await handleAddNotes(selections)
      setShowPicker(false)
    },
    [handleAddNotes, setShowPicker],
  )

  return {
    handleOpenGroupNote,
    handleNoteAction,
    handleConfirmPicker,
  }
}
