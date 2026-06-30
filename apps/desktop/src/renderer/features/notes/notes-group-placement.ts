import {
  reconcileReceivedGroupSharedNotes,
  type GroupSharedNotePlacement,
} from '@toolman/shared'
import type { NotesData } from './notes-storage'

export function reconcileGroupSharedNotesInData(
  data: NotesData,
  placements: GroupSharedNotePlacement[],
  selfMemberIdByWorkspace: Record<string, string | null | undefined>,
): NotesData {
  if (placements.length === 0) return data

  const result = reconcileReceivedGroupSharedNotes({
    notebooks: data.notebooks,
    notes: data.notes,
    placements,
    selfMemberIdByWorkspace,
  })

  if (!result.changed) return data
  return {
    ...data,
    notebooks: result.notebooks,
    notes: result.notes,
  }
}
