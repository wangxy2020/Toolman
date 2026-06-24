import { useCallback, useEffect, useState } from 'react'

import { IpcChannel, type CommunityHubStatusOutput } from '@toolman/shared'

export function useCommunityHubConnection() {
  const [status, setStatus] = useState<CommunityHubStatusOutput | null>(null)

  const refresh = useCallback(async () => {
    const result = await window.api.invoke(IpcChannel.CommunityHubStatus)
    if (result.ok && result.data) {
      setStatus(result.data as CommunityHubStatusOutput)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { status, refresh }
}
