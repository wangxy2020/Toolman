import { useCallback } from 'react'
import type { P2pSharedResource } from '@toolman/shared'
import { ensureGroupKnowledgeDocumentSaved } from './group-knowledge-file-save'
import type { GroupKnowledgePanelProps } from './group-knowledge-panel-types'
import type { UseGroupKnowledgePanelStateResult } from './useGroupKnowledgePanelState'

export function useGroupKnowledgePanelActions(
  { sourceWorkspaceId, onKnowledgeBasesChanged }: GroupKnowledgePanelProps,
  state: UseGroupKnowledgePanelStateResult,
) {
  const { p2pWorkspaceId, p2pKnowledge, setSavedDocumentOverrides } = state

  const handleAddKnowledgeBases = useCallback(
    async (
      selections: Array<{ knowledgeBaseId: string; documentIds?: string[] }>,
    ) => {
      if (!sourceWorkspaceId) {
        throw new Error('工作区未就绪')
      }

      for (const selection of selections) {
        const ok = await p2pKnowledge.shareKnowledgeBase(
          selection.knowledgeBaseId,
          sourceWorkspaceId,
          selection.documentIds,
        )
        if (!ok) {
          throw new Error(p2pKnowledge.error ?? '添加知识库失败')
        }
      }

      await p2pKnowledge.load()
    },
    [p2pKnowledge, sourceWorkspaceId],
  )

  const handleEnsureDocumentSaved = useCallback(
    async (resource: P2pSharedResource, documentId: string) => {
      const result = await ensureGroupKnowledgeDocumentSaved(
        p2pWorkspaceId,
        resource.id,
        documentId,
      )
      if ('error' in result) {
        p2pKnowledge.setError(result.error)
        return null
      }

      setSavedDocumentOverrides((current) => ({
        ...current,
        [resource.id]: {
          ...current[resource.id],
          [documentId]: {
            savedDocumentId: result.savedDocumentId,
            absolutePath: result.absolutePath,
          },
        },
      }))
      await onKnowledgeBasesChanged?.()
      return result
    },
    [onKnowledgeBasesChanged, p2pKnowledge, p2pWorkspaceId, setSavedDocumentOverrides],
  )

  return {
    handleAddKnowledgeBases,
    handleEnsureDocumentSaved,
  }
}
