import { useCallback, useEffect, useState } from 'react'
import { IpcChannel } from '@toolman/shared'

export function useKnowledgeWatchStatus(workspaceId: string | null, kbId: string | null) {
  const [watching, setWatching] = useState<Array<{ folderPath: string; watching: boolean }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId || !kbId) {
      setWatching([])
      return
    }

    setLoading(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.KnowledgeWatchStatus, {
      workspaceId,
      kbId,
    })

    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as {
      items: Array<{ folderPath: string; watching: boolean }>
    }
    setWatching(data.items)
  }, [workspaceId, kbId])

  useEffect(() => {
    void load()
  }, [load])

  const isWatchingPath = useCallback(
    (folderPath: string) =>
      watching.some((item) => item.folderPath === folderPath && item.watching),
    [watching],
  )

  return {
    watching,
    loading,
    error,
    setError,
    load,
    isWatchingPath,
  }
}
