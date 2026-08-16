import { useEffect } from 'react'
import * as Linking from 'expo-linking'
import { isToolmanInviteInput } from '@toolman/shared'
import { enqueueInviteFromInput } from './pendingInvites'

async function acceptInviteUrl(url: string | null): Promise<void> {
  if (!url || !isToolmanInviteInput(url)) return
  await enqueueInviteFromInput(url)
}

export function useP2pInviteLink(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void Linking.getInitialURL().then((url) => {
      if (!cancelled) void acceptInviteUrl(url)
    })
    const sub = Linking.addEventListener('url', (event) => {
      void acceptInviteUrl(event.url)
    })
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [ready])
}
