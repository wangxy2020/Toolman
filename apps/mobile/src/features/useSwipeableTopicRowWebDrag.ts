import { useEffect, type MutableRefObject } from 'react'
import { Platform, type Animated } from 'react-native'
import { isHorizontalSwipe } from './swipeable-row-gesture'

/** Web pointer-drag handler for swipeable rows (native uses PanResponder). */
export function useSwipeableTopicRowWebDrag(options: {
  hostNode: HTMLElement | null
  translateX: Animated.Value
  openRef: MutableRefObject<boolean>
  actionsWidthRef: MutableRefObject<number>
  dragStart: MutableRefObject<number>
  didDrag: MutableRefObject<boolean>
  settleFromDragRef: MutableRefObject<(dx: number, velocityX: number) => void>
}) {
  const {
    hostNode,
    translateX,
    openRef,
    actionsWidthRef,
    dragStart,
    didDrag,
    settleFromDragRef,
  } = options

  useEffect(() => {
    if (Platform.OS !== 'web' || !hostNode) return

    let detachDrag: (() => void) | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.button != null && event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest('[data-testid="swipe-ignore"]')) return

      detachDrag?.()

      const pointerId = event.pointerId
      const startX = event.pageX
      const startY = event.pageY
      let lastX = startX
      let lastT = event.timeStamp || Date.now()
      let velocityX = 0
      let captured = false
      dragStart.current = openRef.current ? -actionsWidthRef.current : 0
      didDrag.current = false

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const dx = moveEvent.pageX - startX
        const dy = moveEvent.pageY - startY
        if (!captured) {
          if (!isHorizontalSwipe(dx, dy, 3)) return
          captured = true
          didDrag.current = true
          try {
            hostNode.setPointerCapture(pointerId)
          } catch {
            /* capture is optional; window listeners still track the drag */
          }
        }
        moveEvent.preventDefault()
        const now = moveEvent.timeStamp || Date.now()
        const dt = Math.max(8, now - lastT)
        velocityX = (moveEvent.pageX - lastX) / dt
        lastX = moveEvent.pageX
        lastT = now
        const max = actionsWidthRef.current
        translateX.setValue(Math.min(0, Math.max(-max, dragStart.current + dx)))
      }

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return
        detach()
        if (!captured) return
        settleFromDragRef.current(upEvent.pageX - startX, velocityX)
      }

      const detach = () => {
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', onUp, true)
        window.removeEventListener('pointercancel', onUp, true)
        try {
          if (hostNode.hasPointerCapture(pointerId)) hostNode.releasePointerCapture(pointerId)
        } catch {
          /* ignore */
        }
        if (detachDrag === detach) detachDrag = null
      }

      detachDrag = detach
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onUp, true)
      window.addEventListener('pointercancel', onUp, true)
    }

    const onDragStart = (event: DragEvent) => {
      event.preventDefault()
    }

    hostNode.addEventListener('pointerdown', onPointerDown)
    hostNode.addEventListener('dragstart', onDragStart)
    return () => {
      detachDrag?.()
      hostNode.removeEventListener('pointerdown', onPointerDown)
      hostNode.removeEventListener('dragstart', onDragStart)
    }
  }, [hostNode, translateX, openRef, actionsWidthRef, dragStart, didDrag, settleFromDragRef])
}
