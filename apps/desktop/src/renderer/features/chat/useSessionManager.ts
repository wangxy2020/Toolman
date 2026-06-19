import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type Session } from '@toolman/shared'

const lastSessionKey = (workspaceId: string) => `toolman:last-session-${workspaceId}`

export function useSessionManager(
  workspaceId: string | null,
  options?: { restoreLastSession?: boolean },
) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const loadSessions = useCallback(async () => {
    if (!workspaceId) return [] as Session[]

    setLoading(true)
    const result = await window.api.invoke(IpcChannel.SessionList, {
      workspaceId,
      pagination: { limit: 50 },
    })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return [] as Session[]
    }

    const data = result.data as { items: Session[] }
    setSessions(data.items)
    return data.items
  }, [workspaceId])

  const createSession = useCallback(async (assistantId?: string) => {
    if (!workspaceId) return null

    const result = await window.api.invoke(IpcChannel.SessionCreate, {
      workspaceId,
      ...(assistantId ? { assistantId } : {}),
    })
    if (!result.ok) {
      setError(result.error.message)
      return null
    }

    const session = result.data as Session
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(session.id)
    setError(null)
    return session
  }, [workspaceId])

  const selectSession = useCallback((sessionId: string) => {
    if (sessionId === activeSessionId) return
    setActiveSessionId(sessionId)
    setError(null)
    if (workspaceId) {
      localStorage.setItem(lastSessionKey(workspaceId), sessionId)
    }
  }, [activeSessionId, workspaceId])

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return null

    const result = await window.api.invoke(IpcChannel.SessionUpdate, {
      id: sessionId,
      title: trimmed,
    })
    if (!result.ok) {
      setError(result.error.message)
      return null
    }

    const updated = result.data as Session
    setSessions((prev) => prev.map((item) => (item.id === sessionId ? updated : item)))
    setError(null)
    return updated
  }, [])

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const result = await window.api.invoke(IpcChannel.SessionDelete, { id: sessionId })
      if (!result.ok) {
        setError(result.error.message)
        return null
      }

      const remaining = sessions.filter((s) => s.id !== sessionId)
      setSessions(remaining)

      if (activeSessionId !== sessionId) {
        return { deletedId: sessionId, nextSessionId: activeSessionId }
      }

      if (remaining.length > 0) {
        const nextId = remaining[0].id
        setActiveSessionId(nextId)
        return { deletedId: sessionId, nextSessionId: nextId }
      }

      const created = await createSession()
      return { deletedId: sessionId, nextSessionId: created?.id ?? null }
    },
    [sessions, activeSessionId, createSession],
  )

  useEffect(() => {
    if (!workspaceId || initialized) return

    void (async () => {
      const items = await loadSessions()
      const savedId = workspaceId ? localStorage.getItem(lastSessionKey(workspaceId)) : null
      const restored = options?.restoreLastSession && savedId
        ? items.find((item) => item.id === savedId)?.id
        : null

      if (restored) {
        setActiveSessionId(restored)
      } else if (items.length > 0) {
        setActiveSessionId(items[0].id)
      } else {
        await createSession()
      }
      setInitialized(true)
    })()
  }, [workspaceId, initialized, loadSessions, createSession, options?.restoreLastSession])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  return {
    sessions,
    activeSession,
    activeSessionId,
    loading,
    error,
    setError,
    initialized,
    loadSessions,
    createSession,
    selectSession,
    renameSession,
    deleteSession,
  }
}
