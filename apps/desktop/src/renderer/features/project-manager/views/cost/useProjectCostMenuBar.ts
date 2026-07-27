import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { useDropdownPos } from '../../pm-menubar-chrome'
import { isCostSectionSummaryFilter } from './pm-cost-catalog'
import type { ProjectCostMenuBarProps } from './ProjectCostMenuBar'

/**
 * Menu open-state and derived labels for `ProjectCostMenuBar`. Kept separate from the component
 * so the render tree only deals with markup + the state/handlers this hook exposes.
 */
export function useProjectCostMenuBar({
  viewFilter,
  sectionFilter,
}: Pick<ProjectCostMenuBarProps, 'viewFilter' | 'sectionFilter'>) {
  const { t } = useI18n()
  const [viewOpen, setViewOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const viewRef = useRef<HTMLSpanElement>(null)
  const typeRef = useRef<HTMLSpanElement>(null)
  const baselineRef = useRef<HTMLSpanElement>(null)
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
      setViewOpen(false)
      setTypeOpen(false)
      setBaselineOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [baselineOpen, typeOpen, viewOpen])

  const viewMenuLabel = t('projectManagerPage.costTable.menu.view')
  const viewCurrentLabel =
    viewFilter === 'all'
      ? t('projectManagerPage.costTable.views.allTypes')
      : t(`projectManagerPage.costTable.types.${viewFilter}`)
  const sectionMenuLabel = t('projectManagerPage.costTable.menu.section')
  const sectionOptionLabel = (key: string) =>
    key ? key : t('projectManagerPage.costTable.views.sectionEmpty')
  const sectionCurrentLabel =
    sectionFilter === 'all'
      ? t('projectManagerPage.costTable.views.allSections')
      : isCostSectionSummaryFilter(sectionFilter)
        ? t('projectManagerPage.costTable.views.sectionSummary')
        : sectionOptionLabel(sectionFilter)
  const baselineMenuLabel = t('projectManagerPage.costTable.menu.baseline')

  return {
    t,
    viewOpen,
    setViewOpen,
    typeOpen,
    setTypeOpen,
    baselineOpen,
    setBaselineOpen,
    viewRef,
    typeRef,
    baselineRef,
    viewPos,
    typePos,
    baselinePos,
    viewMenuLabel,
    viewCurrentLabel,
    sectionMenuLabel,
    sectionOptionLabel,
    sectionCurrentLabel,
    baselineMenuLabel,
  }
}
