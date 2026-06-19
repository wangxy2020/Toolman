import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pSharedResource } from '@toolman/shared'

interface UseP2pNotesOptions {
  workspaceId: string | null
}

export function useP2pNotes({ workspaceId }: UseP2pNotesOptions) {
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
      resourceType: 'Note',
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

  const shareNote = useCallback(
    async (noteId: string) => {
      if (!workspaceId) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pNoteShare, {
        workspaceId,
        noteId,
      })

      setSharing(false)

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      const data = result.data as { sharedResource: P2pSharedResource }
      setSharedResources((current) => {
        const next = current.filter(
          (item) => item.localResourceId !== noteId && item.id !== noteId,
        )
        return [data.sharedResource, ...next]
      })
      return true
    },
    [workspaceId],
  )

  const unshareNote = useCallback(
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

  const setNotePermission = useCallback(
    async (resourceId: string, permission: 'read' | 'write') => {
      if (!workspaceId) return false

      setSharing(true)
      setError(null)

      const result = await window.api.invoke(IpcChannel.P2pNoteSetPermission, {
        workspaceId,
        resourceId,
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
      if (event.workspaceId !== workspaceId || event.resourceType !== 'Note') return
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
    shareNote,
    unshareNote,
    setNotePermission,
  }
}
