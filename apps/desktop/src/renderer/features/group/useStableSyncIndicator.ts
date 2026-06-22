import { useCallback, useEffect, useRef, useState } from 'react'

import { GROUP_P2P_UI_TIMING } from './group-p2p-ui-timing'

/**
 * Hysteresis for the global "syncing" indicator so brief P2P bursts
 * do not push page content up and down.
 */
export function useStableSyncIndicator(isSyncing: boolean) {
  const [visible, setVisible] = useState(false)
  const isSyncingRef = useRef(isSyncing)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  isSyncingRef.current = isSyncing

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== undefined) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = undefined
    }
  }, [])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== undefined) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = undefined
    }
  }, [])

  useEffect(() => {
    if (isSyncing) {
      clearHideTimer()
      if (visible || showTimerRef.current !== undefined) {
        return
      }
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = undefined
        if (isSyncingRef.current) {
          setVisible(true)
        }
      }, GROUP_P2P_UI_TIMING.syncIndicatorShowDelayMs)
      return
    }

    clearShowTimer()
    if (!visible) {
      return
    }
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = undefined
      if (!isSyncingRef.current) {
        setVisible(false)
      }
    }, GROUP_P2P_UI_TIMING.syncIndicatorHideDelayMs)
  }, [clearHideTimer, clearShowTimer, isSyncing, visible])

  useEffect(
    () => () => {
      clearShowTimer()
      clearHideTimer()
    },
    [clearHideTimer, clearShowTimer],
  )

  return visible
}
