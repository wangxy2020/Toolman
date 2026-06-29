import type { GroupAgentsPanelProps } from './group-agents-panel-types'
import { useGroupAgentsPanelActions } from './useGroupAgentsPanelActions'
import { useGroupAgentsPanelDelete } from './useGroupAgentsPanelDelete'
import { useGroupAgentsPanelState } from './useGroupAgentsPanelState'

export function useGroupAgentsPanel(props: GroupAgentsPanelProps) {
  const state = useGroupAgentsPanelState(props)
  const deleteActions = useGroupAgentsPanelDelete(state)
  const actions = useGroupAgentsPanelActions(props, state)

  return {
    ...state,
    ...deleteActions,
    ...actions,
  }
}

export type UseGroupAgentsPanelResult = ReturnType<typeof useGroupAgentsPanel>
