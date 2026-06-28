import { useCallback, useEffect, useRef, useState } from 'react'
import { IpcChannel, type P2pSharedResource } from '@toolman/shared'
import { useDebouncedCallback } from '../../utils/debounce'
import { GROUP_P2P_UI_TIMING } from './group-p2p-ui-timing'
import { subscribeGroupResourceActivity, subscribeGroupResourcePanelRefresh } from './group-p2p-sync-policy'

interface UseP2pWorkflowOptions {
  workspaceId: string | null
}

export function useP2pWorkflow({ workspaceId }: UseP2pWorkflowOptions) {
  const [sharedResources, setSharedResources] = useState<P2pSharedResource[]>([])
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasResourcesRef = useRef(false)

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
      resourceType: 'Workflow',
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

  const shareWorkflow = useCallback(
    async (workflowId: string, sourceWorkspaceId?: string) => {
      if (!workspaceId) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pWorkflowShare, {
        workspaceId,
        workflowId,
        sourceWorkspaceId,
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
            item.localResourceId !== workflowId &&
            item.id !== workflowId &&
            item.id !== data.sharedResource.id,
        )
        return [data.sharedResource, ...next]
      })
      return true
    },
    [workspaceId],
  )

  const unshareWorkflow = useCallback(
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

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId) return
    return subscribeGroupResourcePanelRefresh(workspaceId, 'Workflow', debouncedLoad)
  }, [debouncedLoad, workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    return subscribeGroupResourceActivity(workspaceId, 'Workflow', {
      onMetadata: debouncedLoad,
      onContent: debouncedLoad,
    })
  }, [debouncedLoad, workspaceId])

  return {
    sharedResources,
    loading,
    sharing,
    error,
    setError,
    load,
    shareWorkflow,
    unshareWorkflow,
  }
}
