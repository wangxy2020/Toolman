import { useContext } from 'react'
import { KnowledgeUiContext } from './useKnowledgeUi-context'
import type { KnowledgeUiState } from './useKnowledgeUi-types'

export type { KnowledgeUiState } from './useKnowledgeUi-types'
export { KnowledgeUiProvider } from './useKnowledgeUi-provider'

export function useKnowledgeUi(): KnowledgeUiState {
  const ctx = useContext(KnowledgeUiContext)
  if (!ctx) throw new Error('useKnowledgeUi requires KnowledgeUiProvider')
  return ctx
}

export function useOptionalKnowledgeUi(): KnowledgeUiState | null {
  return useContext(KnowledgeUiContext)
}
