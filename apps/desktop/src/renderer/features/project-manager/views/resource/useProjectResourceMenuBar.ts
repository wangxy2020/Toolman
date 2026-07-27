import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { useDropdownPos } from '../../pm-menubar-chrome'
import {
  encodeCustomResourceViewFilter,
  isPmResourceCostType,
  parseCustomResourceViewFilter,
} from './pm-resource-catalog'
import type { ProjectResourceMenuBarProps } from './ProjectResourceMenuBar'

type SubmenuPos = { top: number; left: number } | null

/**
 * Menu open-state, custom-type submenu positioning, and derived labels for
 * `ProjectResourceMenuBar`. Kept separate from the component so the render tree only deals with
 * markup + the state/handlers this hook exposes.
 */
export function useProjectResourceMenuBar({
  viewFilter,
  onViewFilterChange,
  onRegisterCustomTypeName,
  selectedType,
  selectedCustomTypeName = '',
  onTypeChange,
}: Pick<
  ProjectResourceMenuBarProps,
  | 'viewFilter'
  | 'onViewFilterChange'
  | 'onRegisterCustomTypeName'
  | 'selectedType'
  | 'selectedCustomTypeName'
  | 'onTypeChange'
>) {
  const { t } = useI18n()
  const [viewOpen, setViewOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const [customViewExpanded, setCustomViewExpanded] = useState(false)
  const [customViewSubPos, setCustomViewSubPos] = useState<SubmenuPos>(null)
  const [customTypeSubPos, setCustomTypeSubPos] = useState<SubmenuPos>(null)
  const [customViewDraft, setCustomViewDraft] = useState('')
  const viewRef = useRef<HTMLSpanElement>(null)
  const typeRef = useRef<HTMLSpanElement>(null)
  const baselineRef = useRef<HTMLSpanElement>(null)
  const customViewGroupRef = useRef<HTMLDivElement>(null)
  const customTypeGroupRef = useRef<HTMLButtonElement>(null)
  const customViewHoverTimerRef = useRef<number | null>(null)
  const viewPos = useDropdownPos(viewOpen, viewRef)
  const typePos = useDropdownPos(typeOpen, typeRef)
  const baselinePos = useDropdownPos(baselineOpen, baselineRef)

  useEffect(() => {
    if (!viewOpen && !typeOpen && !baselineOpen) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (viewOpen && viewRef.current?.contains(target)) return
      if (typeOpen && typeRef.current?.contains(target)) return
      if (baselineOpen && baselineRef.current?.contains(target)) return
      if ((target as Element).closest?.('.tm-pm-gantt-view-panel')) return
      if ((target as Element).closest?.('.tm-pm-resource-custom-submenu')) return
      setViewOpen(false)
      setTypeOpen(false)
      setBaselineOpen(false)
      setCustomViewExpanded(false)
      setCustomViewSubPos(null)
      setCustomTypeSubPos(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [baselineOpen, typeOpen, viewOpen])

  useEffect(() => {
    if (!viewOpen) {
      clearCustomViewHoverTimer()
      setCustomViewExpanded(false)
      setCustomViewSubPos(null)
      setCustomViewDraft('')
    }
  }, [viewOpen])

  useEffect(() => {
    if (!typeOpen) setCustomTypeSubPos(null)
  }, [typeOpen])

  useEffect(() => {
    return () => {
      if (customViewHoverTimerRef.current != null) {
        window.clearTimeout(customViewHoverTimerRef.current)
        customViewHoverTimerRef.current = null
      }
    }
  }, [])

  const clearCustomViewHoverTimer = () => {
    if (customViewHoverTimerRef.current != null) {
      window.clearTimeout(customViewHoverTimerRef.current)
      customViewHoverTimerRef.current = null
    }
  }

  const keepCustomViewSubmenu = () => {
    clearCustomViewHoverTimer()
  }

  const scheduleHideCustomViewSubmenu = () => {
    clearCustomViewHoverTimer()
    customViewHoverTimerRef.current = window.setTimeout(() => {
      setCustomViewSubPos(null)
      customViewHoverTimerRef.current = null
    }, 120)
  }

  const hideCustomViewSubmenu = () => {
    clearCustomViewHoverTimer()
    setCustomViewSubPos(null)
  }

  const placeCustomSubmenu = (anchor: HTMLElement, options?: { width?: number; height?: number }) => {
    const rect = anchor.getBoundingClientRect()
    const width = options?.width ?? 140
    const height = options?.height ?? 220
    const sideGap = 12
    const gap = 4
    const margin = 8
    let left = rect.right + sideGap
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, rect.left - width - sideGap)
    }
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow
    let top = openAbove ? rect.top - height - gap : rect.top
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    return { top, left }
  }

  const viewMenuLabel = t('projectManagerPage.resourceTable.menu.view')
  const viewCustomName = parseCustomResourceViewFilter(viewFilter)
  const viewCurrentLabel =
    viewFilter === 'all'
      ? t('projectManagerPage.resourceTable.views.allTypes')
      : viewCustomName != null
        ? viewCustomName || t('projectManagerPage.resourceTable.types.customUnnamed')
        : t(`projectManagerPage.resourceTable.types.${viewFilter}`)
  const typeMenuLabel = t('projectManagerPage.resourceTable.menu.type')
  const typeLabel = isPmResourceCostType(selectedType)
    ? `${t('projectManagerPage.resourceTable.views.costResources')} · ${t(`projectManagerPage.resourceTable.types.${selectedType}`)}`
    : selectedType === 'custom'
      ? selectedCustomTypeName.trim() || t('projectManagerPage.resourceTable.types.custom')
      : t(`projectManagerPage.resourceTable.types.${selectedType}`)
  const baselineMenuLabel = t('projectManagerPage.resourceTable.menu.baseline')

  const closeTypeMenus = () => {
    setTypeOpen(false)
    setCustomTypeSubPos(null)
  }

  const commitCustomViewTypeName = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    onRegisterCustomTypeName(name)
    onViewFilterChange(encodeCustomResourceViewFilter(name))
    setViewOpen(false)
    setCustomViewExpanded(false)
    setCustomViewSubPos(null)
    setCustomViewDraft('')
  }

  const applyCustomTypeToSelection = (name: string) => {
    onTypeChange('custom', name.trim())
    closeTypeMenus()
  }

  return {
    t,
    viewOpen,
    setViewOpen,
    typeOpen,
    setTypeOpen,
    baselineOpen,
    setBaselineOpen,
    customViewExpanded,
    setCustomViewExpanded,
    customViewSubPos,
    setCustomViewSubPos,
    customTypeSubPos,
    setCustomTypeSubPos,
    customViewDraft,
    setCustomViewDraft,
    viewRef,
    typeRef,
    baselineRef,
    customViewGroupRef,
    customTypeGroupRef,
    viewPos,
    typePos,
    baselinePos,
    keepCustomViewSubmenu,
    scheduleHideCustomViewSubmenu,
    hideCustomViewSubmenu,
    placeCustomSubmenu,
    viewMenuLabel,
    viewCurrentLabel,
    typeMenuLabel,
    typeLabel,
    baselineMenuLabel,
    closeTypeMenus,
    commitCustomViewTypeName,
    applyCustomTypeToSelection,
  }
}
