import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pPeerTrustRequiredPayload } from '@toolman/shared'

const TRUST_REQUIRED_CHANNEL = 'p2p:peer:trust-required'

export function useP2pTrustPrompt() {
  const [prompt, setPrompt] = useState<P2pPeerTrustRequiredPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return window.api.subscribe(TRUST_REQUIRED_CHANNEL, (payload) => {
      setPrompt(payload as P2pPeerTrustRequiredPayload)
      setError(null)
    })
  }, [])

  const respond = useCallback(async (trusted: boolean) => {
    if (!prompt) return

    setError(null)
    const result = await window.api.invoke(IpcChannel.P2pMemberTrustDevice, {
      workspaceId: prompt.workspaceId,
      peerDeviceId: prompt.peerDeviceId,
      trusted,
    })

    if (!result.ok) {
      setError(result.error.message)
      throw new Error(result.error.message)
    }

    setPrompt(null)
  }, [prompt])

  const dismiss = useCallback(() => {
    setPrompt(null)
    setError(null)
  }, [])

  return {
    prompt,
    error,
    respond,
    dismiss,
  }
}
