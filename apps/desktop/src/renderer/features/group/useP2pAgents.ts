import { useCallback, useEffect, useRef, useState } from 'react'
import { IpcChannel, type P2pAgentSessionPermission, type P2pSharedResource } from '@toolman/shared'
import { useDebouncedCallback } from '../../utils/debounce'
import { GROUP_P2P_UI_TIMING } from './group-p2p-ui-timing'
import { subscribeGroupResourceActivity } from './group-p2p-sync-policy'

interface UseP2pAgentsOptions {
  workspaceId: string | null
  /** 智能体包体更新后（Shared / package_json Updated）刷新本地 mirror */
  onContentActivity?: () => void | Promise<void>
}

export function useP2pAgents({ workspaceId, onContentActivity }: UseP2pAgentsOptions) {
  const [sharedResources, setSharedResources] = useState<P2pSharedResource[]>([])
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasResourcesRef = useRef(false)
  const onContentActivityRef = useRef(onContentActivity)

  useEffect(() => {
    onContentActivityRef.current = onContentActivity
  }, [onContentActivity])

  const load = useCallback(async () => {
    if (!workspaceId) {
      setSharedResources([])
      setError(null)
      hasResourcesRef.current = false
      return
    }

    const showLoading = !hasResourcesRef.current
    if (showLoading) {
      setLoading(true)
    }
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pResourceList, {
      workspaceId,
      resourceType: 'Agent',
      status: 'active',
    })

    if (showLoading) {
      setLoading(false)
    }

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { resources: P2pSharedResource[] }
    hasResourcesRef.current = data.resources.length > 0
    setSharedResources(data.resources)
  }, [workspaceId])

  const debouncedLoad = useDebouncedCallback(load, GROUP_P2P_UI_TIMING.dataRefreshDebounceMs)

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
      hasResourcesRef.current = true
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

      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pAgentSetSessionPermission, {
        workspaceId,
        resourceId,
        sessionId,
        permission,
      })

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      const data = result.data as { sharedResource: P2pSharedResource }
      setSharedResources((current) =>
        current.map((item) => (item.id === resourceId ? data.sharedResource : item)),
      )
      return true
    },
    [workspaceId],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId) return
    return subscribeGroupResourceActivity(workspaceId, 'Agent', {
      onMetadata: debouncedLoad,
      onContent: () => {
        debouncedLoad()
        void onContentActivityRef.current?.()
      },
    })
  }, [debouncedLoad, workspaceId])

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
