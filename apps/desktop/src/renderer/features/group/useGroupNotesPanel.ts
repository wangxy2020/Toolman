import type { GroupNotesPanelProps } from './group-notes-panel-types'
import { useGroupNotesPanelActions } from './useGroupNotesPanelActions'
import { useGroupNotesPanelDelete } from './useGroupNotesPanelDelete'
import { useGroupNotesPanelState } from './useGroupNotesPanelState'

export function useGroupNotesPanel(props: GroupNotesPanelProps) {
  const state = useGroupNotesPanelState(props)
  const deleteActions = useGroupNotesPanelDelete(state)
  const actions = useGroupNotesPanelActions(props, state)

  return {
    ...state,
    ...deleteActions,
    ...actions,
  }
}

export type UseGroupNotesPanelResult = ReturnType<typeof useGroupNotesPanel>
