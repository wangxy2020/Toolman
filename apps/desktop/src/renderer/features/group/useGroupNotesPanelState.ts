import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRegisterGroupPanelError } from './group-page-status'
import { useP2pNotes } from './useP2pNotes'
import { useI18n } from '../../i18n/useI18n'
import type {
  GroupNotesPanelProps,
  NoteActionMenuState,
  PendingNoteDelete,
} from './group-notes-panel-types'
import {
  buildMemberNotebookSections,
  canDeleteGroupNoteResource,
  canEditGroupNoteResource,
  toggleNoteSectionSelection,
  toggleNoteSelection,
} from './group-notes-panel-utils'

export function useGroupNotesPanelState({
  p2pWorkspaceId,
  workspaceName,
  notebooks,
  notes,
  canManageGroupResources,
  canWriteWorkspace,
  members,
  selfMemberId,
  selfMemberRole,
  onSyncGroupNoteLock,
}: GroupNotesPanelProps) {
  const { t } = useI18n()
  const [showPicker, setShowPicker] = useState(false)
  const [noteActionMenu, setNoteActionMenu] = useState<NoteActionMenuState | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removingNotebookId, setRemovingNotebookId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingNoteDelete | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [sectionKeysMap, setSectionKeysMap] = useState<Record<string, string[]>>({})

  const p2pNotes = useP2pNotes({ workspaceId: p2pWorkspaceId })

  useRegisterGroupPanelError('notes', p2pNotes.error, () => p2pNotes.setError(null))

  const notesById = useMemo(() => new Map(notes.map((item) => [item.id, item])), [notes])
  const notebooksById = useMemo(
    () => new Map(notebooks.map((item) => [item.id, item])),
    [notebooks],
  )

  const sharedNoteIds = useMemo(
    () =>
      new Set(p2pNotes.sharedResources.map((item) => item.localResourceId ?? item.id)),
    [p2pNotes.sharedResources],
  )

  const canDeleteResource = useCallback(
    (resource: { sharedBy: string }) =>
      canDeleteGroupNoteResource(
        resource,
        canWriteWorkspace,
        canManageGroupResources,
        selfMemberId,
      ),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const canManagePermission = useCallback(
    (resource: { sharedBy: string }) =>
      canDeleteGroupNoteResource(
        resource,
        canWriteWorkspace,
        canManageGroupResources,
        selfMemberId,
      ),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const resolveEditable = useCallback(
    (resource: Parameters<typeof canEditGroupNoteResource>[0]) =>
      canEditGroupNoteResource(resource, selfMemberRole, selfMemberId),
    [selfMemberId, selfMemberRole],
  )

  useEffect(() => {
    if (!onSyncGroupNoteLock) return
    for (const resource of p2pNotes.sharedResources) {
      const noteId = resource.localResourceId ?? resource.id
      if (!notesById.has(noteId)) continue
      onSyncGroupNoteLock(noteId, !resolveEditable(resource))
    }
  }, [notesById, onSyncGroupNoteLock, p2pNotes.sharedResources, resolveEditable])

  const canManageNotes = useMemo(
    () =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        p2pNotes.sharedResources.some((resource) => canDeleteResource(resource))),
    [canDeleteResource, canManageGroupResources, canWriteWorkspace, p2pNotes.sharedResources],
  )

  const memberNotebookSections = useMemo(
    () =>
      buildMemberNotebookSections(
        p2pNotes.sharedResources,
        members,
        selfMemberId,
        notebooks,
        notesById,
        notebooksById,
        t('groupPage.panels.unknownMember'),
        t('groupPage.panels.unknownNotebook'),
      ),
    [members, notebooks, notebooksById, notesById, p2pNotes.sharedResources, selfMemberId, t],
  )

  const flatNotebookSections = useMemo(
    () => memberNotebookSections.flatMap((memberSection) => memberSection.notebookSections),
    [memberNotebookSections],
  )

  const handleToggleSelect = useCallback((resourceId: string) => {
    setSelectedIds((current) => toggleNoteSelection(current, resourceId))
  }, [])

  const handleToggleSelectSection = useCallback((resourceIds: string[]) => {
    setSelectedIds((current) => toggleNoteSectionSelection(current, resourceIds))
  }, [])

  const handleSectionKeysChange = useCallback((sectionKey: string, resourceIds: string[]) => {
    setSectionKeysMap((current) => ({ ...current, [sectionKey]: resourceIds }))
  }, [])

  return {
    t,
    workspaceName,
    p2pWorkspaceId,
    notebooks,
    notes,
    canWriteWorkspace,
    p2pNotes,
    showPicker,
    setShowPicker,
    noteActionMenu,
    setNoteActionMenu,
    selectedIds,
    setSelectedIds,
    removingId,
    setRemovingId,
    removingNotebookId,
    setRemovingNotebookId,
    pendingDelete,
    setPendingDelete,
    contextMenu,
    setContextMenu,
    sectionKeysMap,
    notesById,
    notebooksById,
    sharedNoteIds,
    canDeleteResource,
    canManagePermission,
    resolveEditable,
    canManageNotes,
    memberNotebookSections,
    flatNotebookSections,
    handleToggleSelect,
    handleToggleSelectSection,
    handleSectionKeysChange,
  }
}

export type UseGroupNotesPanelStateResult = ReturnType<typeof useGroupNotesPanelState>
