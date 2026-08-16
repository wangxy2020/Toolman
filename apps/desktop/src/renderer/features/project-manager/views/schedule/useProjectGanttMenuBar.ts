import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { useDropdownPos } from '../../pm-menubar-chrome'
import type { GanttScheduleView } from './pm-gantt-prefs'
import type { ProjectGanttMenuBarProps } from './ProjectGanttMenuBarTypes'

export type GanttMenuDropdownKey =
  | 'view'
  | 'type'
  | 'baseline'
  | 'node'
  | 'resourceAssign'
  | 'costAssign'
  | 'smartAssign'
  | 'analysis'

/**
 * Menu open-state and derived labels for `ProjectGanttMenuBar`. Kept separate from the component
 * so the render tree only deals with markup + the state/handlers this hook exposes.
 */
export function useProjectGanttMenuBar({
  scheduleView,
  selectedTaskType,
}: Pick<ProjectGanttMenuBarProps, 'scheduleView' | 'selectedTaskType'>) {
  const { t } = useI18n()
  const [openMenu, setOpenMenu] = useState<GanttMenuDropdownKey | null>(null)
  const viewRef = useRef<HTMLSpanElement>(null)
  const typeRef = useRef<HTMLSpanElement>(null)
  const baselineRef = useRef<HTMLSpanElement>(null)
  const nodeRef = useRef<HTMLSpanElement>(null)
  const resourceAssignRef = useRef<HTMLSpanElement>(null)
  const costAssignRef = useRef<HTMLSpanElement>(null)
  const smartAssignRef = useRef<HTMLSpanElement>(null)
  const analysisRef = useRef<HTMLSpanElement>(null)

  const viewPos = useDropdownPos(openMenu === 'view', viewRef)
  const typePos = useDropdownPos(openMenu === 'type', typeRef)
  const baselinePos = useDropdownPos(openMenu === 'baseline', baselineRef)
  const nodePos = useDropdownPos(openMenu === 'node', nodeRef)
  const resourceAssignPos = useDropdownPos(openMenu === 'resourceAssign', resourceAssignRef)
  const costAssignPos = useDropdownPos(openMenu === 'costAssign', costAssignRef)
  const smartAssignPos = useDropdownPos(openMenu === 'smartAssign', smartAssignRef)
  const analysisPos = useDropdownPos(openMenu === 'analysis', analysisRef)

  const toggleMenu = (key: GanttMenuDropdownKey) => {
    setOpenMenu((current) => (current === key ? null : key))
  }

  useEffect(() => {
    if (!openMenu) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      const refs: Array<[GanttMenuDropdownKey, React.RefObject<HTMLElement | null>]> = [
        ['view', viewRef],
        ['type', typeRef],
        ['baseline', baselineRef],
        ['node', nodeRef],
        ['resourceAssign', resourceAssignRef],
        ['costAssign', costAssignRef],
        ['smartAssign', smartAssignRef],
        ['analysis', analysisRef],
      ]
      for (const [key, ref] of refs) {
        if (openMenu !== key) continue
        if (ref.current?.contains(target)) return
        if ((target as Element).closest?.('.tm-pm-gantt-view-panel')) return
      }
      setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openMenu])

  const structureLocked = scheduleView === 'resource'

  const viewLabelByMode: Record<GanttScheduleView, string> = {
    list: t('projectManagerPage.schedule.views.list'),
    gantt: t('projectManagerPage.schedule.views.gantt'),
    progressCheck: t('projectManagerPage.schedule.views.progressCheck'),
    resource: t('projectManagerPage.schedule.views.resource'),
    cost: t('projectManagerPage.schedule.views.cost'),
  }

  const typeLabel = ((): string =>
    selectedTaskType === 'milestone'
      ? t('projectManagerPage.schedule.menu.setMilestone')
      : t('projectManagerPage.schedule.menu.setTask'))()

  return {
    t,
    openMenu,
    setOpenMenu,
    toggleMenu,
    viewRef,
    typeRef,
    baselineRef,
    nodeRef,
    resourceAssignRef,
    costAssignRef,
    smartAssignRef,
    analysisRef,
    viewPos,
    typePos,
    baselinePos,
    nodePos,
    resourceAssignPos,
    costAssignPos,
    smartAssignPos,
    analysisPos,
    structureLocked,
    viewLabelByMode,
    typeLabel,
  }
}
