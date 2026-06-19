import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pAgentSessionPermission, type P2pSharedResource } from '@toolman/shared'

interface UseP2pAgentsOptions {
  workspaceId: string | null
}

export function useP2pAgents({ workspaceId }: UseP2pAgentsOptions) {
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
      resourceType: 'Agent',
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

  const shareAgent = useCallback(
    async (assistantId: string, sourceWorkspaceId?: string, sessionIds?: string[]) => {
      if (!workspaceId) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pAgentShare, {
        workspaceId,
        assistantId,
        sourceWorkspaceId,
        ...(sessionIds?.length ? { sessionIds } : {}),
      })

      setSharing(false)

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      const data = result.data as { sharedResource: P2pSharedResource }
      setSharedResources((current) => {
        const next = current.filter(
          (item) =>
            item.localResourceId !== assistantId &&
            item.id !== assistantId &&
            item.id !== data.sharedResource.id,
        )
        return [data.sharedResource, ...next]
      })
      return true
    },
    [workspaceId],
  )

  const unshareAgent = useCallback(
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

  const removeSessions = useCallback(
    async (resourceId: string, sessionIds: string[]) => {
      if (!workspaceId || sessionIds.length === 0) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pAgentRemoveSessions, {
        workspaceId,
        resourceId,
        sessionIds,
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

  const setSessionPermission = useCallback(
    async (resourceId: string, sessionId: string, permission: P2pAgentSessionPermission) => {
      if (!workspaceId) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pAgentSetSessionPermission, {
        workspaceId,
        resourceId,
        sessionId,
        permission,
      })

      setSharing(false)

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      const data = result.data as { sharedResource: P2pSharedResource }
      setSharedResources((current) =>
        current.map((item) => (item.id === resourceId ? data.sharedResource : item)),
      )
      await load()
      return true
    },
    [load, workspaceId],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId) return

    const handleEvent = (payload: unknown) => {
      const event = payload as { workspaceId?: string; resourceType?: string }
      if (event.workspaceId !== workspaceId || event.resourceType !== 'Agent') return
      void load()
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleEvent)

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
    }
  }, [load, workspaceId])

  return {
    sharedResources,
    loading,
    sharing,
    error,
    setError,
    load,
    shareAgent,
    unshareAgent,
    removeSessions,
    setSessionPermission,
  }
}
