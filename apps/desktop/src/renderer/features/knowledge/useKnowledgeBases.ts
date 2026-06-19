import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type KnowledgeBase, type KnowledgeBaseKind } from '@toolman/shared'
import { DEFAULT_KNOWLEDGE_FOLDER_ID, isKnowledgeVirtualFolderId } from './knowledge-sidebar-types'

interface UseKnowledgeBasesOptions {
  workspaceId: string | null
}

export function useKnowledgeBases({ workspaceId }: UseKnowledgeBasesOptions) {
  const [items, setItems] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(DEFAULT_KNOWLEDGE_FOLDER_ID)

  const load = useCallback(async () => {
    if (!workspaceId) {
      setItems([])
      return
    }

    setLoading(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeBaseList, { workspaceId })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { items: KnowledgeBase[] }
    const nextItems = data.items
    setItems(nextItems)
    setActiveId((current) => {
      if (isKnowledgeVirtualFolderId(current)) return current
      if (current && nextItems.some((item) => item.id === current)) return current
      return nextItems[0]?.id ?? DEFAULT_KNOWLEDGE_FOLDER_ID
    })
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  const create = useCallback(
    async (input: { name: string; description?: string; kind?: KnowledgeBaseKind }) => {
      if (!workspaceId) return null

      setError(null)
      const result = await window.api.invoke(IpcChannel.KnowledgeBaseCreate, {
        workspaceId,
        name: input.name,
        description: input.description,
        kind: input.kind ?? 'local',
      })

      if (!result.ok) {
        setError(result.error.message)
        throw new Error(result.error.message)
      }

      await load()
      setActiveId((result.data as KnowledgeBase).id)
      return result.data as KnowledgeBase
    },
    [workspaceId, load],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!workspaceId) return false

      setError(null)
      const result = await window.api.invoke(IpcChannel.KnowledgeBaseDelete, {
        id,
        workspaceId,
      })

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      await load()
      return true
    },
    [workspaceId, load],
  )

  const active = items.find((item) => item.id === activeId) ?? null

  return {
    items,
    active,
    activeId,
    setActiveId,
    loading,
    error,
    setError,
    load,
    create,
    remove,
  }
}
