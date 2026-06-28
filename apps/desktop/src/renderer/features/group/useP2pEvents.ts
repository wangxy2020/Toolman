import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type WorkspaceEvent } from '@toolman/shared'

interface UseP2pEventsOptions {
  workspaceId: string | null
}

function mergeEventsDesc(current: WorkspaceEvent[], incoming: WorkspaceEvent): WorkspaceEvent[] {
  if (incoming.resourceType === 'GroupChat') {
    return current
  }
  if (current.some((item) => item.eventId === incoming.eventId)) {
    return current
  }
  return [...current, incoming].sort((a, b) => b.seq - a.seq)
}

export function useP2pEvents({ workspaceId }: UseP2pEventsOptions) {
  const [events, setEvents] = useState<WorkspaceEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) {
      setEvents([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pEventList, {
      workspaceId,
      limit: 100,
    })

    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { events: WorkspaceEvent[] }
    setEvents(data.events.filter((event) => event.resourceType !== 'GroupChat'))
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId) return

    const handleEvent = (payload: unknown) => {
      const event = payload as WorkspaceEvent
      if (event.workspaceId !== workspaceId) return
      setEvents((current) => mergeEventsDesc(current, event))
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleEvent)

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
    }
  }, [workspaceId])

  return {
    events,
    loading,
    error,
    load,
  }
}
