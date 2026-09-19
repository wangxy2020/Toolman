import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { useDropdownPos } from '../../pm-menubar-chrome'
import type { ProjectCostMenuBarProps } from './ProjectCostMenuBar'
import { isCostPracticeViewPage } from './project-cost-menu-bar-types'
import { formatDatabaseRowFilterLabel } from './pm-cost-row-filter'

/**
 * Menu open-state and derived labels for `ProjectCostMenuBar`. Kept separate from the component
 * so the render tree only deals with markup + the state/handlers this hook exposes.
 */
export function useProjectCostMenuBar({
  viewFilter,
  viewMenuVariant = 'catalog',
  databaseRowFilter,
  subprojectOptions,
  sectionalOptions,
}: Pick<
  ProjectCostMenuBarProps,
  | 'viewFilter'
  | 'viewMenuVariant'
  | 'databaseRowFilter'
  | 'subprojectOptions'
  | 'sectionalOptions'
>) {
  const { t } = useI18n()
  const [viewOpen, setViewOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [fetchOpen, setFetchOpen] = useState(false)
  const [meteringOpen, setMeteringOpen] = useState(false)
  const viewRef = useRef<HTMLSpanElement>(null)
  const typeRef = useRef<HTMLSpanElement>(null)
  const fetchRef = useRef<HTMLSpanElement>(null)
  const meteringRef = useRef<HTMLSpanElement>(null)
  const viewPos = useDropdownPos(viewOpen, viewRef)
  const typePos = useDropdownPos(typeOpen, typeRef)
  const fetchPos = useDropdownPos(fetchOpen, fetchRef)
  const meteringPos = useDropdownPos(meteringOpen, meteringRef)

  useEffect(() => {
    if (!viewOpen && !typeOpen && !fetchOpen && !meteringOpen) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (viewOpen && viewRef.current?.contains(target)) return
      if (typeOpen && typeRef.current?.contains(target)) return
      if (fetchOpen && fetchRef.current?.contains(target)) return
      if (meteringOpen && meteringRef.current?.contains(target)) return
      if ((target as Element).closest?.('.tm-pm-gantt-view-panel')) return
      setViewOpen(false)
      setTypeOpen(false)
      setFetchOpen(false)
      setMeteringOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [fetchOpen, meteringOpen, typeOpen, viewOpen])

  const viewMenuLabel = t('projectManagerPage.costTable.menu.view')
  const viewCurrentLabel =
    viewFilter === 'all'
      ? t(
          viewMenuVariant === 'practice'
            ? 'projectManagerPage.costTable.views.priceList'
            : 'projectManagerPage.costTable.views.allTypes',
        )
      : isCostPracticeViewPage(viewFilter)
        ? t(`projectManagerPage.costTable.views.${viewFilter}`)
        : t(`projectManagerPage.costTable.types.${viewFilter}`)
  const sectionMenuLabel = t('projectManagerPage.costTable.menu.filter')
  const sectionOptionLabel = (key: string) =>
    key ? key : t('projectManagerPage.costTable.columns.filterUncategorized')
  const sectionCurrentLabel = formatDatabaseRowFilterLabel(databaseRowFilter, {
    allLabel: t('projectManagerPage.costTable.columns.filterAll'),
    optionLabel: sectionOptionLabel,
    subprojectOptions,
    sectionalOptions,
  })
  const fetchMenuLabel = t('projectManagerPage.costTable.menu.fetch')
  const meteringMenuLabel = t('projectManagerPage.costTable.menu.metering')

  return {
    t,
    viewOpen,
    setViewOpen,
    typeOpen,
    setTypeOpen,
    fetchOpen,
    setFetchOpen,
    meteringOpen,
    setMeteringOpen,
    viewRef,
    typeRef,
    fetchRef,
    meteringRef,
    viewPos,
    typePos,
    fetchPos,
    meteringPos,
    viewMenuLabel,
    viewCurrentLabel,
    sectionMenuLabel,
    sectionOptionLabel,
    sectionCurrentLabel,
    fetchMenuLabel,
    meteringMenuLabel,
  }
}
