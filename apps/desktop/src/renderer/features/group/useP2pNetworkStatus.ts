import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pNetworkSnapshot } from '@toolman/shared'

export function useP2pNetworkStatus() {
  const [snapshot, setSnapshot] = useState<P2pNetworkSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await window.api.invoke(IpcChannel.P2pNetworkGetSnapshot)
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setSnapshot(result.data as P2pNetworkSnapshot)
    setError(null)
  }, [])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.api.subscribe('p2p:network:snapshot-updated', (payload) => {
      setSnapshot(payload as P2pNetworkSnapshot)
      setError(null)
      setLoading(false)
    })
    return unsubscribe
  }, [refresh])

  return { snapshot, loading, error, refresh }
}
