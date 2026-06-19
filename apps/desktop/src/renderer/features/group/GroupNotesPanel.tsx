import { useCallback, useMemo, useState } from 'react'
import { canEditSharedResource, IpcChannel, type P2pMemberRole, type P2pSharedResource } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupNotePickerModal } from './GroupNotePickerModal'
import { GroupNoteActionMenu, type GroupNoteAction } from './GroupNoteActionMenu'
import { GroupFileContextMenu } from './GroupFileList'
import { GroupPanelHeader } from './GroupPanelHeader'
import type { OpenGroupNoteRequest, SaveGroupNoteAsCopyRequest } from './group-note-open'
import {
  GroupSharedNotebookSection,
  type GroupNoteListItem,
} from './GroupSharedNotebookSection'
import { useP2pNotes } from './useP2pNotes'
import type { NoteItem, NotebookItem } from '../notes/notes-storage'

interface Props {
  p2pWorkspaceId: string
  workspaceName: string
  notebooks: NotebookItem[]
  notes: NoteItem[]
  syncFolderPath?: string | null
  canManageGroupResources: boolean
  canWriteWorkspace: boolean
  selfMemberId: string | null
  selfMemberRole: P2pMemberRole | null
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onSaveGroupNoteAsCopy?: (request: SaveGroupNoteAsCopyRequest) => void | Promise<void>
}

interface PendingDelete {
  resourceIds: string[]
  message: string
}

const UNKNOWN_NOTEBOOK_ID = '__unknown_notebook__'

export function GroupNotesPanel({
  p2pWorkspaceId,
  workspaceName,
  notebooks,
  notes,
  syncFolderPath = null,
  canManageGroupResources,
  canWriteWorkspace,
  selfMemberId,
  selfMemberRole,
  onOpenGroupNote,
  onSaveGroupNoteAsCopy,
}: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const [noteActionMenu, setNoteActionMenu] = useState<{
    x: number
    y: number
    align: 'bottom-start'
    resource: P2pSharedResource
    note: NoteItem | null
  } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removingNotebookId, setRemovingNotebookId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [sectionKeysMap, setSectionKeysMap] = useState<Record<string, string[]>>({})
  const p2pNotes = useP2pNotes({ workspaceId: p2pWorkspaceId })

  const notesById = useMemo(() => new Map(notes.map((item) => [item.id, item])), [notes])

  const notebooksById = useMemo(
    () => new Map(notebooks.map((item) => [item.id, item])),
    [notebooks],
  )

  const sharedNoteIds = useMemo(
    () =>
      new Set(
        p2pNotes.sharedResources.map((item) => item.localResourceId ?? item.id),
      ),
    [p2pNotes.sharedResources],
  )

  const canDeleteResource = useCallback(
    (resource: { sharedBy: string }) =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        (selfMemberId != null && resource.sharedBy === selfMemberId)),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const canManagePermission = useCallback(
    (resource: { sharedBy: string }) =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        (selfMemberId != null && resource.sharedBy === selfMemberId)),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const resolveEditable = useCallback(
    (resource: P2pSharedResource) =>
      canEditSharedResource(selfMemberRole ?? undefined, selfMemberId, {
        permission: resource.permission,
        sharedBy: resource.sharedBy,
      }),
    [selfMemberId, selfMemberRole],
  )

  const handleOpenGroupNote = useCallback(
    (request: OpenGroupNoteRequest) => {
      const resource = p2pNotes.sharedResources.find(
        (item) => (item.localResourceId ?? item.id) === request.noteId,
      )
      return onOpenGroupNote?.({
        ...request,
        workspaceId: p2pWorkspaceId,
        workspaceName,
        permission: resource?.permission ?? request.permission,
        sharedBy: resource?.sharedBy ?? request.sharedBy,
        editable: request.editable
          ? resource
            ? resolveEditable(resource)
            : false
          : false,
      })
    },
    [onOpenGroupNote, p2pNotes.sharedResources, p2pWorkspaceId, resolveEditable, workspaceName],
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

      if (!canManagePermission(resource)) {
        return
      }

      if (action === 'read') {
        const ok = await p2pNotes.setNotePermission(resource.id, 'read')
        if (!ok) {
          p2pNotes.setError(p2pNotes.error ?? '设置权限失败')
        }
        return
      }

      if (action === 'edit') {
        const ok = await p2pNotes.setNotePermission(resource.id, 'write')
        if (!ok) {
          p2pNotes.setError(p2pNotes.error ?? '设置权限失败')
        }
      }
    },
    [canManagePermission, noteActionMenu, onSaveGroupNoteAsCopy, p2pNotes],
  )

  const canManageNotes = useMemo(
    () =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        p2pNotes.sharedResources.some((resource) => canDeleteResource(resource))),
    [canDeleteResource, canManageGroupResources, canWriteWorkspace, p2pNotes.sharedResources],
  )

  const notebookSections = useMemo(() => {
    const groups = new Map<string, GroupNoteListItem[]>()

    for (const resource of p2pNotes.sharedResources) {
      const noteId = resource.localResourceId ?? resource.id
      const note = notesById.get(noteId) ?? null
      const notebookId = note?.notebookId ?? UNKNOWN_NOTEBOOK_ID
      const bucket = groups.get(notebookId) ?? []
      bucket.push({ resource, note })
      groups.set(notebookId, bucket)
    }

    const notebookOrder = new Map(notebooks.map((item, index) => [item.id, index]))

    return [...groups.entries()]
      .map(([notebookId, items]) => {
        const sortedItems = [...items].sort((left, right) => {
          const leftUpdated = left.note?.updatedAt ?? left.resource.updatedAt
          const rightUpdated = right.note?.updatedAt ?? right.resource.updatedAt
          return rightUpdated - leftUpdated
        })

        const name =
          notebookId === UNKNOWN_NOTEBOOK_ID
            ? '未知笔记本'
            : (notebooksById.get(notebookId)?.name ?? '笔记本')

        return {
          notebookId,
          name,
          items: sortedItems,
        }
      })
      .sort((left, right) => {
        const leftOrder = notebookOrder.get(left.notebookId) ?? Number.MAX_SAFE_INTEGER
        const rightOrder = notebookOrder.get(right.notebookId) ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return left.name.localeCompare(right.name, 'zh-CN')
      })
  }, [notebooks, notebooksById, notesById, p2pNotes.sharedResources])

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

  const handleToggleSelect = useCallback((resourceId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(resourceId)) next.delete(resourceId)
      else next.add(resourceId)
      return next
    })
  }, [])

  const handleToggleSelectSection = useCallback((resourceIds: string[]) => {
    setSelectedIds((current) => {
      const allSelected =
        resourceIds.length > 0 && resourceIds.every((id) => current.has(id))
      const next = new Set(current)
      if (allSelected) {
        for (const id of resourceIds) next.delete(id)
      } else {
        for (const id of resourceIds) next.add(id)
      }
      return next
    })
  }, [])

  const requestDelete = useCallback(
    (resourceIds: string[], message?: string) => {
      const deletableIds = resourceIds.filter((id) => {
        const resource = p2pNotes.sharedResources.find((item) => item.id === id)
        return resource ? canDeleteResource(resource) : false
      })

      if (deletableIds.length === 0) {
        p2pNotes.setError('无权移除所选笔记')
        return
      }

      if (message) {
        setPendingDelete({ resourceIds: deletableIds, message })
        return
      }

      const names = deletableIds
        .map((id) => {
          const resource = p2pNotes.sharedResources.find((item) => item.id === id)
          const noteId = resource?.localResourceId ?? resource?.id
          return notesById.get(noteId ?? '')?.title ?? resource?.name
        })
        .filter(Boolean)
      const preview = names.slice(0, 2).join('、')
      const suffix =
        names.length > 2 ? ` 等 ${names.length} 篇笔记` : names.length > 1 ? '' : ''

      setPendingDelete({
        resourceIds: deletableIds,
        message: `确定从群组中移除「${preview}」${suffix}吗？`,
      })
    },
    [canDeleteResource, notesById, p2pNotes],
  )

  const requestRemoveNotebook = useCallback(
    (notebookId: string, resourceIds: string[]) => {
      const notebookName =
        notebookId === UNKNOWN_NOTEBOOK_ID
          ? '未知笔记本'
          : (notebooksById.get(notebookId)?.name ?? '笔记本')
      const deletableCount = resourceIds.filter((id) => {
        const resource = p2pNotes.sharedResources.find((item) => item.id === id)
        return resource ? canDeleteResource(resource) : false
      }).length

      if (deletableCount === 0) {
        p2pNotes.setError('无权移除该笔记本下的笔记')
        return
      }

      requestDelete(
        resourceIds,
        `确定从群组中移除笔记本「${notebookName}」下的 ${deletableCount} 篇笔记吗？`,
      )
    },
    [canDeleteResource, notebooksById, p2pNotes, requestDelete],
  )

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return

    const { resourceIds } = pendingDelete
    setPendingDelete(null)
    setRemovingId(resourceIds[0] ?? null)
    setRemovingNotebookId(
      notebookSections.find((section) =>
        section.items.some((item) => resourceIds.includes(item.resource.id)),
      )?.notebookId ?? null,
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
  }, [notebookSections, pendingDelete, p2pNotes])

  const handleRemoveNote = useCallback(
    (resourceId: string) => {
      requestDelete([resourceId])
    },
    [requestDelete],
  )

  const handleSectionKeysChange = useCallback((notebookId: string, resourceIds: string[]) => {
    setSectionKeysMap((current) => ({ ...current, [notebookId]: resourceIds }))
  }, [])

  const handleSelectAll = useCallback(() => {
    const next = new Set<string>()
    for (const ids of Object.values(sectionKeysMap)) {
      for (const id of ids) next.add(id)
    }
    setSelectedIds(next)
  }, [sectionKeysMap])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleDeleteSelected = useCallback(() => {
    requestDelete(Array.from(selectedIds))
  }, [requestDelete, selectedIds])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canManageNotes) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [canManageNotes],
  )

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title="群组笔记"
        subtitle={`${workspaceName} · ${p2pNotes.sharedResources.length} 篇笔记`}
      />

      {p2pNotes.error ? <div className="tm-error-bar">{p2pNotes.error}</div> : null}

      <div className="tm-kb-file-panel" onContextMenu={handleContextMenu}>
        <button
          type="button"
          className="tm-kb-file-dropzone"
          disabled={p2pNotes.sharing || !canWriteWorkspace}
          onClick={() => setShowPicker(true)}
        >
          <span className="tm-kb-file-dropzone-title">
            {p2pNotes.sharing ? '正在添加笔记…' : '点击添加笔记到群组'}
          </span>
          <span className="tm-kb-file-dropzone-hint">从已有笔记本中选择笔记，共享给群组成员</span>
        </button>

        {p2pNotes.loading && p2pNotes.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>加载笔记列表中…</p>
          </div>
        ) : p2pNotes.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>暂无群组笔记，点击上方区域添加</p>
          </div>
        ) : (
          <div className="tm-group-shared-knowledge-list">
            {notebookSections.map((section) => (
              <GroupSharedNotebookSection
                key={section.notebookId}
                notebookId={section.notebookId}
                notebookName={section.name}
                items={section.items}
                selectedIds={selectedIds}
                canDeleteNote={canDeleteResource}
                removingNotebook={removingNotebookId === section.notebookId}
                removingId={removingId}
                onToggleSelect={handleToggleSelect}
                onToggleSelectSection={handleToggleSelectSection}
                onRemoveNotebook={() => {
                  requestRemoveNotebook(
                    section.notebookId,
                    section.items.map((item) => item.resource.id),
                  )
                }}
                onRemoveNote={handleRemoveNote}
                onOpenGroupNote={handleOpenGroupNote}
                onOpenNoteMenu={(resource, note, anchor) =>
                  setNoteActionMenu({ ...anchor, resource, note })
                }
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
          selectedCount={selectedIds.size}
          canDelete={canManageNotes}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="移除群组笔记"
          message={pendingDelete.message}
          confirmLabel="移除"
          danger
          onCancel={() => {
            setPendingDelete(null)
            setRemovingNotebookId(null)
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {showPicker ? (
        <GroupNotePickerModal
          notebooks={notebooks}
          notes={notes}
          sharedNoteIds={sharedNoteIds}
          onClose={() => setShowPicker(false)}
          onConfirm={async (selections) => {
            await handleAddNotes(selections)
            setShowPicker(false)
          }}
        />
      ) : null}

      {noteActionMenu ? (
        <GroupNoteActionMenu
          x={noteActionMenu.x}
          y={noteActionMenu.y}
          align={noteActionMenu.align}
          permission={
            p2pNotes.sharedResources.find((item) => item.id === noteActionMenu.resource.id)
              ?.permission ?? noteActionMenu.resource.permission
          }
          canSetPermission={canManagePermission(noteActionMenu.resource)}
          onClose={() => setNoteActionMenu(null)}
          onSelect={(action) => handleNoteAction(action)}
        />
      ) : null}
    </div>
  )
}
