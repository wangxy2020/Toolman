import { useCallback, useLayoutEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export function useProjectManagementFilesScroll(args: {
  tableScrollRef: RefObject<HTMLDivElement | null>
  headerPinInnerRef: RefObject<HTMLDivElement | null>
  hTrackRef: RefObject<HTMLDivElement | null>
  isMeteringCostView: boolean
  matrixLayout: 'horizontal' | 'vertical'
  meteringColumnVisibility: unknown
  monthKeyCount: number
  visibleRowCount: number
}) {
  const {
    tableScrollRef, headerPinInnerRef, hTrackRef, isMeteringCostView, matrixLayout,
    meteringColumnVisibility, monthKeyCount, visibleRowCount,
  } = args
  const [hScrollMetrics, setHScrollMetrics] = useState({ overflowing: false, thumbSize: 0, thumbOffset: 0 })
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
    const { scrollLeft, scrollWidth, clientWidth } = el
    if (scrollWidth <= clientWidth + 1) {
      setHScrollMetrics({ overflowing: false, thumbSize: 0, thumbOffset: 0 })
      return
    }
    const thumbSize = Math.max(28, (clientWidth / scrollWidth) * clientWidth)
    const maxOffset = Math.max(0, clientWidth - thumbSize)
    const maxScroll = scrollWidth - clientWidth
    const thumbOffset = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * maxOffset
    setHScrollMetrics({ overflowing: true, thumbSize, thumbOffset })
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
  }, [
    isMeteringCostView,
    matrixLayout,
    meteringColumnVisibility,
    monthKeyCount,
    syncHScrollMetrics,
    visibleRowCount,
  ])

  const scrollToThumbOffset = useCallback((nextOffsetRatio: number) => {
    const el = tableScrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const travel = 1 - thumbSize
    const clamped = Math.max(0, Math.min(travel, nextOffsetRatio))
    el.scrollLeft = travel <= 0 ? 0 : (clamped / travel) * maxScroll
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
