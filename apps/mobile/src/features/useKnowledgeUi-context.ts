import { createContext } from 'react'
import type { KnowledgeUiState } from './useKnowledgeUi-types'

export const KnowledgeUiContext = createContext<KnowledgeUiState | null>(null)
