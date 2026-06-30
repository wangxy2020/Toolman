import { buildGroupNotebookId, isGroupNotebookId } from './group-notebook.js'

export interface GroupSharedNotePlacement {
  noteId: string
  p2pWorkspaceId: string
  workspaceName: string
  sharedBy: string
}

export interface GroupSharedNotesNotebook {
  id: string
  name: string
  isDefault?: boolean
}

export interface GroupSharedNotesNote {
  id: string
  notebookId: string
  locked?: boolean
  groupPermissionLocked?: boolean
  updatedAt?: number
}

export interface ReconcileGroupSharedNotesInput<
  TNotebook extends GroupSharedNotesNotebook = GroupSharedNotesNotebook,
  TNote extends GroupSharedNotesNote = GroupSharedNotesNote,
> {
  notebooks: TNotebook[]
  notes: TNote[]
  placements: GroupSharedNotePlacement[]
  selfMemberIdByWorkspace: Record<string, string | null | undefined>
}

function ensureGroupNotebook<T extends GroupSharedNotesNotebook>(
  notebooks: T[],
  workspaceId: string,
  workspaceName: string,
): T[] {
  const id = buildGroupNotebookId(workspaceId)
  const name = workspaceName.trim() || '群组笔记'
  if (notebooks.some((item) => item.id === id)) {
    return notebooks.map((item) => (item.id === id ? { ...item, name } : item))
  }
  return [...notebooks, { id, name } as T]
}

/** Move received group-shared notes into group-notebook:{workspaceId} for non-owners. */
export function reconcileReceivedGroupSharedNotes<
  TNotebook extends GroupSharedNotesNotebook,
  TNote extends GroupSharedNotesNote,
>(input: ReconcileGroupSharedNotesInput<TNotebook, TNote>): {
  notebooks: TNotebook[]
  notes: TNote[]
  changed: boolean
} {
  const placementByNote = new Map<string, GroupSharedNotePlacement>()
  for (const placement of input.placements) {
    placementByNote.set(placement.noteId, placement)
  }

  let notebooks = [...input.notebooks]
  let changed = false
  const notes = input.notes.map((note) => {
    const placement = placementByNote.get(note.id)
    if (!placement) return note

    const selfMemberId = input.selfMemberIdByWorkspace[placement.p2pWorkspaceId] ?? null
    if (selfMemberId && placement.sharedBy === selfMemberId) {
      return note
    }

    const targetNotebookId = buildGroupNotebookId(placement.p2pWorkspaceId)
    if (note.notebookId === targetNotebookId && isGroupNotebookId(note.notebookId)) {
      return note
    }

    changed = true
    const nextNotebooks = ensureGroupNotebook(
      notebooks,
      placement.p2pWorkspaceId,
      placement.workspaceName,
    )
    if (nextNotebooks.length !== notebooks.length) {
      notebooks = nextNotebooks
    } else {
      notebooks = nextNotebooks
    }

    return {
      ...note,
      notebookId: targetNotebookId,
      locked: note.locked ?? true,
      groupPermissionLocked: note.groupPermissionLocked ?? true,
    }
  })

  return { notebooks, notes, changed }
}
