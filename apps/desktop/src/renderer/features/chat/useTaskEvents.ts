import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type TaskEvent } from '@toolman/shared'

function mergeTaskEvents(current: TaskEvent[], incoming: TaskEvent): TaskEvent[] {
  const key = `${incoming.type}:${incoming.timestamp}:${incoming.taskId}`
  if (
    current.some(
      (item) => `${item.type}:${item.timestamp}:${item.taskId}` === key,
    )
  ) {
    return current
  }
  return [...current, incoming].sort((a, b) => a.timestamp - b.timestamp)
}

export function useTaskEvents(taskId: string | null | undefined) {
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!taskId) {
      setEvents([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.TaskEventList, {
      taskId,
      limit: 200,
    })

    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { items: TaskEvent[] }
    setEvents(data.items)
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!taskId) return

    const unsubscribe = window.api.subscribe(IpcChannel.TaskStream, (payload) => {
      const event = payload as TaskEvent
      if (event.taskId !== taskId) return
      setEvents((current) => mergeTaskEvents(current, event))
    })

    const onCleared = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string }>).detail
      if (detail?.taskId !== taskId) return
      setEvents([])
      void load()
    }
    window.addEventListener('toolman:task-events-cleared', onCleared)

    return () => {
      unsubscribe()
      window.removeEventListener('toolman:task-events-cleared', onCleared)
    }
  }, [load, taskId])

  return {
    events,
    loading,
    error,
    reload: load,
  }
}
