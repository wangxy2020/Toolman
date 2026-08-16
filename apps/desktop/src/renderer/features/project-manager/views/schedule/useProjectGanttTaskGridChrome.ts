import type { PointerEvent as ReactPointerEvent, WheelEvent } from 'react'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { PmCostType } from '../cost/pm-cost-catalog'
import type { PmResourceType } from '../resource/pm-resource-catalog'
import {
  EMPTY_H_SCROLL,
  type ContextMenuState,
  type CostAssignPopupState,
  type CostNamePickerState,
  type HScrollMetrics,
  type ResourceAssignPopupState,
  type ResourceCellPickerState,
  type RowContextMenuState,
} from './pm-gantt-task-grid-utils'

export function useProjectGanttTaskGridChrome(args: {
  gridTemplate: string
  listView: boolean
  rowsLength: number
  selectionResetKey?: string | null
  contextMenu: ContextMenuState | null
  rowContextMenu: RowContextMenuState | null
  resourceAssignPopup: ResourceAssignPopupState | null
  costAssignPopup: CostAssignPopupState | null
  resourceCellPicker: ResourceCellPickerState | null
  costNamePicker: CostNamePickerState | null
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  setRowContextMenu: Dispatch<SetStateAction<RowContextMenuState | null>>
  setSelectionMode: Dispatch<SetStateAction<boolean>>
  setResourceAssignPopup: Dispatch<SetStateAction<ResourceAssignPopupState | null>>
  setResourceCellPicker: Dispatch<SetStateAction<ResourceCellPickerState | null>>
  setResourceAssignDraftTypes: Dispatch<SetStateAction<Record<number, PmResourceType>>>
  setCostAssignPopup: Dispatch<SetStateAction<CostAssignPopupState | null>>
  setCostAssignSelectedSlot: Dispatch<SetStateAction<number | null>>
  setCostAssignDraftTypes: Dispatch<SetStateAction<Record<number, PmCostType>>>
  setCostNamePicker: Dispatch<SetStateAction<CostNamePickerState | null>>
  onWheelScroll?: (deltaY: number) => void
}) {
  const {
    gridTemplate,
    listView,
    rowsLength,
    selectionResetKey,
    contextMenu,
    rowContextMenu,
    resourceAssignPopup,
    costAssignPopup,
    resourceCellPicker,
    costNamePicker,
    setContextMenu,
    setRowContextMenu,
    setSelectionMode,
    setResourceAssignPopup,
    setResourceCellPicker,
    setResourceAssignDraftTypes,
    setCostAssignPopup,
    setCostAssignSelectedSlot,
    setCostAssignDraftTypes,
    setCostNamePicker,
    onWheelScroll,
  } = args

  const [hScrollMetrics, setHScrollMetrics] = useState<HScrollMetrics>(EMPTY_H_SCROLL)
  const [hScrollDragging, setHScrollDragging] = useState(false)
  const hScrollRef = useRef<HTMLDivElement>(null)
  const hTrackRef = useRef<HTMLDivElement>(null)
  const headerPinInnerRef = useRef<HTMLDivElement>(null)

  const dismissPopups = () => {
    setContextMenu(null)
    setRowContextMenu(null)
    setResourceAssignPopup(null)
    setResourceCellPicker(null)
    setResourceAssignDraftTypes({})
    setCostAssignPopup(null)
    setCostAssignSelectedSlot(null)
    setCostAssignDraftTypes({})
    setCostNamePicker(null)
  }

  const syncHeaderPinScroll = () => {
    const el = hScrollRef.current
    const pin = headerPinInnerRef.current
    if (!el || !pin) return
    pin.style.transform = `translateX(${-el.scrollLeft}px)`
  }

  const syncHScrollMetrics = () => {
    const el = hScrollRef.current
    if (!el) return
    syncHeaderPinScroll()
    const { scrollWidth, clientWidth, scrollLeft } = el
    const overflowing = scrollWidth > clientWidth + 1
    if (!overflowing) {
      setHScrollMetrics(EMPTY_H_SCROLL)
      return
    }
    const thumbSize = Math.min(1, clientWidth / scrollWidth)
    const maxScroll = scrollWidth - clientWidth
    const thumbOffset = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * (1 - thumbSize)
    setHScrollMetrics({ overflowing: true, thumbSize, thumbOffset })
  }

  useEffect(() => {
    const el = hScrollRef.current
    if (!el) return
    syncHScrollMetrics()
    const ro = new ResizeObserver(() => syncHScrollMetrics())
    ro.observe(el)
    const inner = el.firstElementChild
    if (inner) ro.observe(inner)
    window.addEventListener('resize', syncHScrollMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHScrollMetrics)
    }
  }, [gridTemplate, listView, rowsLength])

  useEffect(() => {
    setSelectionMode(false)
    setRowContextMenu(null)
    setResourceAssignPopup(null)
    setResourceCellPicker(null)
    setResourceAssignDraftTypes({})
    setCostAssignPopup(null)
    setCostAssignSelectedSlot(null)
    setCostAssignDraftTypes({})
    setCostNamePicker(null)
  }, [selectionResetKey])

  useEffect(() => {
    if (
      !contextMenu &&
      !rowContextMenu &&
      !resourceAssignPopup &&
      !costAssignPopup &&
      !resourceCellPicker &&
      !costNamePicker
    ) {
      return
    }
    const onDoc = (event: globalThis.MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        dismissPopups()
        return
      }
      if (target.closest('.tm-pm-gantt-resource-select-menu')) return
      if (!target.closest('.tm-pm-gantt-cost-name-trigger')) {
        setCostNamePicker(null)
      }
      if (
        target.closest(
          [
            '.tm-pm-gantt-resource-cell-trigger',
            '.tm-pm-gantt-cost-name-trigger',
            '.tm-pm-gantt-resource-assign-popup',
            '.tm-pm-gantt-col-menu',
          ].join(', '),
        )
      ) {
        return
      }
      dismissPopups()
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      dismissPopups()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [
    contextMenu,
    rowContextMenu,
    resourceAssignPopup,
    costAssignPopup,
    resourceCellPicker,
    costNamePicker,
  ])

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (listView || !onWheelScroll) return
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
    event.preventDefault()
    onWheelScroll(event.deltaY)
  }

  const scrollToThumbOffset = (nextOffset: number) => {
    const el = hScrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const travel = 1 - thumbSize
    const clamped = Math.max(0, Math.min(travel, nextOffset))
    el.scrollLeft = travel <= 0 ? 0 : (clamped / travel) * maxScroll
  }

  const onHTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = hTrackRef.current
    const el = hScrollRef.current
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
    }
    const onUp = () => {
      setHScrollDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return {
    hScrollMetrics,
    hScrollDragging,
    hScrollRef,
    hTrackRef,
    headerPinInnerRef,
    syncHScrollMetrics,
    handleWheel,
    onHTrackPointerDown,
  }
}
