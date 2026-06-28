import { useCallback, useEffect, useRef, useState } from 'react'
import { IpcChannel, type P2pKnowledgeDocumentPermission, type P2pSharedResource } from '@toolman/shared'
import { useDebouncedCallback } from '../../utils/debounce'
import { GROUP_P2P_UI_TIMING } from './group-p2p-ui-timing'
import {
  subscribeGroupResourcePanelRefresh,
  subscribeKnowledgeResourceListEvents,
} from './group-p2p-sync-policy'

interface UseP2pKnowledgeOptions {
  workspaceId: string | null
}

export function useP2pKnowledge({ workspaceId }: UseP2pKnowledgeOptions) {
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
      resourceType: 'Knowledge',
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
      hasResourcesRef.current = true
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

      setSharedResources((current) => {
        const next = current.filter((item) => item.id !== resourceId)
        hasResourcesRef.current = next.length > 0
        return next
      })
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
        setSharedResources((current) => {
          const next = current.filter((item) => item.id !== resourceId)
          hasResourcesRef.current = next.length > 0
          return next
        })
      } else {
        hasResourcesRef.current = true
        setSharedResources((current) =>
          current.map((item) => (item.id === resourceId ? data.sharedResource! : item)),
        )
      }
      return true
    },
    [workspaceId],
  )

  const setDocumentPermission = useCallback(
    async (
      resourceId: string,
      documentId: string,
      permission: P2pKnowledgeDocumentPermission,
    ) => {
      if (!workspaceId) return false

      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pKnowledgeSetDocumentPermission, {
        workspaceId,
        resourceId,
        documentId,
        permission,
      })

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      const data = result.data as { sharedResource: P2pSharedResource }
      hasResourcesRef.current = true
      setSharedResources((current) =>
        current.map((item) => (item.id === resourceId ? data.sharedResource : item)),
      )
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
    return subscribeGroupResourcePanelRefresh(workspaceId, 'Knowledge', debouncedLoad)
  }, [debouncedLoad, workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    return subscribeKnowledgeResourceListEvents(workspaceId, debouncedLoad)
  }, [debouncedLoad, workspaceId])

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
    setDocumentPermission,
    isShared,
  }
}
