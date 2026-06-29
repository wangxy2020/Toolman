import type { KnowledgePageProps } from './knowledge-page-types'
import { useKnowledgePageDocuments } from './useKnowledgePageDocuments'
import { useKnowledgePageState } from './useKnowledgePageState'

export function useKnowledgePage(props: KnowledgePageProps) {
  const state = useKnowledgePageState(props)
  const documents = useKnowledgePageDocuments(props, state)

  const {
    setSortField: _setSortField,
    setSortAscending: _setSortAscending,
    ...publicState
  } = state

  return {
    ...publicState,
    ...documents,
  }
}

export type UseKnowledgePageResult = ReturnType<typeof useKnowledgePage>
