import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pSharedResource } from '@toolman/shared'

interface UseP2pKnowledgeOptions {
  workspaceId: string | null
}

export function useP2pKnowledge({ workspaceId }: UseP2pKnowledgeOptions) {
  const [sharedResources, setSharedResources] = useState<P2pSharedResource[]>([])
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) {
      setSharedResources([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pResourceList, {
      workspaceId,
      resourceType: 'Knowledge',
      status: 'active',
    })

    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { resources: P2pSharedResource[] }
    setSharedResources(data.resources)
  }, [workspaceId])

  const shareKnowledgeBase = useCallback(
    async (
      knowledgeBaseId: string,
      sourceWorkspaceId?: string,
      documentIds?: string[],
    ) => {
      if (!workspaceId) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pKnowledgeShare, {
        workspaceId,
        knowledgeBaseId,
        sourceWorkspaceId,
        ...(documentIds ? { documentIds } : {}),
      })

      setSharing(false)

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      const data = result.data as { sharedResource: P2pSharedResource }
      setSharedResources((current) => {
        const next = current.filter((item) => item.localResourceId !== knowledgeBaseId)
        return [data.sharedResource, ...next]
      })
      return true
    },
    [workspaceId],
  )

  const unshareKnowledgeBase = useCallback(
    async (resourceId: string) => {
      if (!workspaceId) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pResourceUnshare, {
        workspaceId,
        resourceId,
      })

      setSharing(false)

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      setSharedResources((current) => current.filter((item) => item.id !== resourceId))
      return true
    },
    [workspaceId],
  )

  const removeDocuments = useCallback(
    async (resourceId: string, documentIds: string[]) => {
      if (!workspaceId || documentIds.length === 0) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pKnowledgeRemoveDocuments, {
        workspaceId,
        resourceId,
        documentIds,
      })

      setSharing(false)

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      const data = result.data as { sharedResource: P2pSharedResource | null }
      if (!data.sharedResource) {
        setSharedResources((current) => current.filter((item) => item.id !== resourceId))
      } else {
        setSharedResources((current) =>
          current.map((item) => (item.id === resourceId ? data.sharedResource! : item)),
        )
      }
      return true
    },
    [workspaceId],
  )

  const isShared = useCallback(
    (knowledgeBaseId: string) =>
      sharedResources.some(
        (item) =>
          item.status === 'active' &&
          (item.localResourceId === knowledgeBaseId || item.id === knowledgeBaseId),
      ),
    [sharedResources],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId) return

    const unsubscribeEvent = window.api.subscribe('p2p:event:appended', (payload) => {
      const event = payload as { workspaceId?: string; resourceType?: string }
      if (event.workspaceId !== workspaceId || event.resourceType !== 'Knowledge') return
      void load()
    })

    const unsubscribeSync = window.api.subscribe('p2p:sync:event-applied', (payload) => {
      const event = payload as { workspaceId?: string; resourceType?: string }
      if (event.workspaceId !== workspaceId || event.resourceType !== 'Knowledge') return
      void load()
    })

    return () => {
      unsubscribeEvent()
      unsubscribeSync()
    }
  }, [load, workspaceId])

  return {
    sharedResources,
    loading,
    sharing,
    error,
    setError,
    load,
    shareKnowledgeBase,
    unshareKnowledgeBase,
    removeDocuments,
    isShared,
  }
}
