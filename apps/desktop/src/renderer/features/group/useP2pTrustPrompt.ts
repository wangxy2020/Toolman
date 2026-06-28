import { useCallback, useEffect, useState } from 'react'
import {
  IpcChannel,
  P2pMemberListPendingTrustPromptsOutputSchema,
  type P2pPeerTrustRequiredPayload,
} from '@toolman/shared'

const TRUST_REQUIRED_CHANNEL = 'p2p:peer:trust-required'

async function loadFirstPendingTrustPrompt(): Promise<P2pPeerTrustRequiredPayload | null> {
  const result = await window.api.invoke(IpcChannel.P2pMemberListPendingTrustPrompts)
  if (!result.ok) return null
  const parsed = P2pMemberListPendingTrustPromptsOutputSchema.safeParse(result.data)
  if (!parsed.success || parsed.data.prompts.length === 0) return null
  return parsed.data.prompts[0] ?? null
}

export function useP2pTrustPrompt() {
  const [prompt, setPrompt] = useState<P2pPeerTrustRequiredPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const applyPending = () => {
      void loadFirstPendingTrustPrompt().then((next) => {
        if (next) {
          setPrompt((current) => current ?? next)
        }
      })
    }

    applyPending()
    const retryTimers = [400, 1200, 3000].map((delayMs) => setTimeout(applyPending, delayMs))

    const unsubMember = window.api.subscribe('p2p:member:changed', applyPending)
    const unsubscribe = window.api.subscribe(TRUST_REQUIRED_CHANNEL, (payload) => {
      setPrompt(payload as P2pPeerTrustRequiredPayload)
      setError(null)
    })

    return () => {
      unsubMember()
      unsubscribe()
      for (const timer of retryTimers) {
        clearTimeout(timer)
      }
    }
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
