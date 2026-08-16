import { useCallback, useLayoutEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

import { computeHScrollMetrics } from '../../pm-panel-shared'
import { scrollLeftForThumbRatio } from './pm-cost-panel-utils'

export function useProjectCostTableScroll(args: {
  tableScrollRef: RefObject<HTMLDivElement | null>
  headerPinInnerRef: RefObject<HTMLDivElement | null>
  hTrackRef: RefObject<HTMLDivElement | null>
  rowCount: number
  selectionMode: boolean
}) {
  const { tableScrollRef, headerPinInnerRef, hTrackRef, rowCount, selectionMode } = args
  const [hScrollMetrics, setHScrollMetrics] = useState({
    overflowing: false,
    thumbSize: 0,
    thumbOffset: 0,
  })
  const [hScrollDragging, setHScrollDragging] = useState(false)

  const syncHeaderPinScroll = useCallback(() => {
    const el = tableScrollRef.current
    const pin = headerPinInnerRef.current
    if (!el || !pin) return
    pin.style.transform = `translateX(${-el.scrollLeft}px)`
  }, [])

  const syncHScrollMetrics = useCallback(() => {
    const el = tableScrollRef.current
    if (!el) return
    syncHeaderPinScroll()
    const metrics = computeHScrollMetrics(el, el.clientWidth, 28)
    setHScrollMetrics({
      overflowing: metrics.overflowing,
      thumbSize: metrics.thumbSize,
      thumbOffset: metrics.thumbOffset,
    })
  }, [syncHeaderPinScroll])

  useLayoutEffect(() => {
    syncHScrollMetrics()
    const el = tableScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => syncHScrollMetrics())
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    window.addEventListener('resize', syncHScrollMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHScrollMetrics)
    }
  }, [rowCount, syncHScrollMetrics, selectionMode])

  const scrollToThumbOffset = useCallback((nextOffsetRatio: number) => {
    const el = tableScrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    el.scrollLeft = scrollLeftForThumbRatio(el, nextOffsetRatio)
  }, [])

  const onHTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const track = hTrackRef.current
      const el = tableScrollRef.current
      if (!track || !el) return
      event.preventDefault()
      setHScrollDragging(true)
      const trackRect = track.getBoundingClientRect()
      const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
      const pointerRatio = (event.clientX - trackRect.left) / trackRect.width
      scrollToThumbOffset(pointerRatio - thumbSize / 2)

      const onMove = (moveEvent: PointerEvent) => {
        const ratio = (moveEvent.clientX - trackRect.left) / trackRect.width
        scrollToThumbOffset(ratio - thumbSize / 2)
        syncHScrollMetrics()
      }
      const onUp = () => {
        setHScrollDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [scrollToThumbOffset, syncHScrollMetrics],
  )

  return { hScrollMetrics, hScrollDragging, syncHScrollMetrics, onHTrackPointerDown }
}
