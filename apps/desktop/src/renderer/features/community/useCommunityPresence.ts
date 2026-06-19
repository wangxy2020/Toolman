import { useEffect } from 'react'

import { touchCommunityPresenceHeartbeat } from './community-api.client'
import { isCommunitySessionActive, COMMUNITY_SESSION_CHANGED_EVENT } from '../user/community-session'

const HEARTBEAT_INTERVAL_MS = 30_000

export function useCommunityPresence(enabled = true): void {
  useEffect(() => {
    if (!enabled) return

    let timer: number | null = null

    const pulse = () => {
      if (!isCommunitySessionActive()) return
      void touchCommunityPresenceHeartbeat().catch(() => undefined)
    }

    const start = () => {
      if (!isCommunitySessionActive()) return
      pulse()
      if (timer !== null) window.clearInterval(timer)
      timer = window.setInterval(pulse, HEARTBEAT_INTERVAL_MS)
    }

    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer)
        timer = null
      }
    }

    const onSessionChanged = () => {
      if (isCommunitySessionActive()) {
        start()
      } else {
        stop()
      }
    }

    onSessionChanged()
    window.addEventListener(COMMUNITY_SESSION_CHANGED_EVENT, onSessionChanged)
    return () => {
      stop()
      window.removeEventListener(COMMUNITY_SESSION_CHANGED_EVENT, onSessionChanged)
    }
  }, [enabled])
}
