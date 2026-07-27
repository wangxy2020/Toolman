/**
 * Shared open-state / chrome hooks for project-manager MenuBars (resource / cost / schedule /
 * files). Each MenuBar renders its own markup, but the dropdown positioning, custom horizontal
 * scrollbar, and hover-tooltip behavior were duplicated byte-for-byte across all four files.
 */
import type { FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

type MenuBarDropdownPos = { top: number; left: number }

/** Anchors a portal-rendered dropdown panel under `anchorRef`, tracking resize/scroll. */
export function useDropdownPos(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
): MenuBarDropdownPos | null {
  const [pos, setPos] = useState<MenuBarDropdownPos | null>(null)
  useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const updatePos = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open, anchorRef])
  return pos
}

type MenuBarScrollMetrics = {
  overflowing: boolean
  thumbSize: number
  thumbOffset: number
}

const EMPTY_MENUBAR_SCROLL: MenuBarScrollMetrics = { overflowing: false, thumbSize: 1, thumbOffset: 0 }

/**
 * Drives a MenuBar's custom horizontal scrollbar: tracks overflow via `ResizeObserver`, and
 * exposes a pointer-drag handler that maps thumb position back to `scrollLeft`.
 */
export function useMenuBarHScroll() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [scrollMetrics, setScrollMetrics] = useState<MenuBarScrollMetrics>(EMPTY_MENUBAR_SCROLL)

  const syncScrollMetrics = () => {
    const el = scrollRef.current
    if (!el) return
    const { scrollWidth, clientWidth, scrollLeft } = el
    const overflowing = scrollWidth > clientWidth + 1
    if (!overflowing) {
      setScrollMetrics(EMPTY_MENUBAR_SCROLL)
      return
    }
    const thumbSize = Math.min(1, clientWidth / scrollWidth)
    const maxScroll = scrollWidth - clientWidth
    const thumbOffset = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * (1 - thumbSize)
    setScrollMetrics({ overflowing: true, thumbSize, thumbOffset })
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    syncScrollMetrics()
    const ro = new ResizeObserver(() => syncScrollMetrics())
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    window.addEventListener('resize', syncScrollMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncScrollMetrics)
    }
  }, [])

  const scrollToThumbOffset = (nextOffset: number) => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const travel = 1 - thumbSize
    const clamped = Math.max(0, Math.min(travel, nextOffset))
    el.scrollLeft = travel <= 0 ? 0 : (clamped / travel) * maxScroll
  }

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    const el = scrollRef.current
    if (!track || !el) return
    event.preventDefault()
    const trackRect = track.getBoundingClientRect()
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const pointerRatio = (event.clientX - trackRect.left) / trackRect.width
    scrollToThumbOffset(pointerRatio - thumbSize / 2)

    const onMove = (moveEvent: PointerEvent) => {
      const ratio = (moveEvent.clientX - trackRect.left) / trackRect.width
      scrollToThumbOffset(ratio - thumbSize / 2)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { scrollRef, trackRef, scrollMetrics, syncScrollMetrics, onTrackPointerDown }
}

type MenuBarTooltipState = { text: string; top: number; left: number }

/** Hover/focus tooltip shown above toolbar buttons (positioned via a portal by the caller). */
export function useMenuBarTooltip() {
  const [tooltip, setTooltip] = useState<MenuBarTooltipState | null>(null)

  const hideTip = () => setTooltip(null)

  const showTipFromEl = (el: HTMLElement, text: string) => {
    const rect = el.getBoundingClientRect()
    setTooltip({ text, top: rect.bottom + 6, left: rect.left + rect.width / 2 })
  }

  const tipProps = (text: string) => ({
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => showTipFromEl(event.currentTarget, text),
    onMouseLeave: hideTip,
    onFocus: (event: ReactFocusEvent<HTMLElement>) => showTipFromEl(event.currentTarget, text),
    onBlur: hideTip,
  })

  return { tooltip, hideTip, tipProps }
}
