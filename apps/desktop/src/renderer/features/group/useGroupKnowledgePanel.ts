import type { GroupKnowledgePanelProps } from './group-knowledge-panel-types'
import { useGroupKnowledgePanelActions } from './useGroupKnowledgePanelActions'
import { useGroupKnowledgePanelDelete } from './useGroupKnowledgePanelDelete'
import { useGroupKnowledgePanelState } from './useGroupKnowledgePanelState'

export function useGroupKnowledgePanel(props: GroupKnowledgePanelProps) {
  const state = useGroupKnowledgePanelState(props)
  const deleteActions = useGroupKnowledgePanelDelete(state)
  const actions = useGroupKnowledgePanelActions(props, state)

  const {
    setSelectedKeys: _setSelectedKeys,
    setRemovingKbId: _setRemovingKbId,
    setRemovingDocumentId: _setRemovingDocumentId,
    sectionKeysMap: _sectionKeysMap,
    savedDocRegistry: _savedDocRegistry,
    setSavedDocumentOverrides: _setSavedDocumentOverrides,
    ...publicState
  } = state

  return {
    ...publicState,
    ...deleteActions,
    ...actions,
  }
}

export type UseGroupKnowledgePanelResult = ReturnType<typeof useGroupKnowledgePanel>
