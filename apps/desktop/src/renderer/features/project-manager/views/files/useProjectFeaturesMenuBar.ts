import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { useDropdownPos } from '../../pm-menubar-chrome'
import type { PmCostPracticeQuotaType } from '../cost/pm-cost-catalog'
import {
  isFeaturesResourceStatFilter,
  type CostPracticeQuotaView,
  type FeaturesScheduleView,
  type ProjectFeaturesMenuBarProps,
  type ResourcePracticeQuotaView,
} from './ProjectFeaturesMenuBar'

/**
 * Menu open-state and derived labels for `ProjectFeaturesMenuBar`. Kept separate from the
 * component so the render tree only deals with markup + the state/handlers this hook exposes.
 */
export function useProjectFeaturesMenuBar({
  selectedType,
  scheduleView = 'gantt',
  viewMenuMode = 'schedule',
  quotaView = 'labor',
  costQuotaView = 'constructionQuota',
}: Pick<
  ProjectFeaturesMenuBarProps,
  'selectedType' | 'scheduleView' | 'viewMenuMode' | 'quotaView' | 'costQuotaView'
>) {
  const { t } = useI18n()
  const [viewOpen, setViewOpen] = useState(false)
  const [resourceStatsOpen, setResourceStatsOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const viewRef = useRef<HTMLSpanElement>(null)
  const resourceStatsRef = useRef<HTMLSpanElement>(null)
  const baselineRef = useRef<HTMLSpanElement>(null)
  const viewPos = useDropdownPos(viewOpen, viewRef)
  const resourceStatsPos = useDropdownPos(resourceStatsOpen, resourceStatsRef)
  const baselinePos = useDropdownPos(baselineOpen, baselineRef)

  useEffect(() => {
    if (!viewOpen && !resourceStatsOpen && !baselineOpen) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (viewOpen && viewRef.current?.contains(target)) return
      if (resourceStatsOpen && resourceStatsRef.current?.contains(target)) return
      if (baselineOpen && baselineRef.current?.contains(target)) return
      if ((target as Element).closest?.('.tm-pm-gantt-view-panel')) return
      setViewOpen(false)
      setResourceStatsOpen(false)
      setBaselineOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [baselineOpen, resourceStatsOpen, viewOpen])

  const viewLabelByMode: Record<FeaturesScheduleView, string> = {
    list: t('projectManagerPage.schedule.views.list'),
    gantt: t('projectManagerPage.schedule.views.gantt'),
    progressCheck: t('projectManagerPage.schedule.views.progressCheck'),
    resource: t('projectManagerPage.schedule.views.resource'),
    cost: t('projectManagerPage.schedule.views.cost'),
  }
  const quotaLabelByMode: Record<ResourcePracticeQuotaView, string> = {
    labor: t('projectManagerPage.resourcePractice.views.labor'),
    material: t('projectManagerPage.resourcePractice.views.material'),
    equipment: t('projectManagerPage.resourcePractice.views.equipment'),
  }
  const costQuotaLabelByMode: Record<PmCostPracticeQuotaType, string> = {
    constructionQuota: t('projectManagerPage.costPractice.views.constructionQuota'),
    budgetQuota: t('projectManagerPage.costPractice.views.budgetQuota'),
    estimateQuota: t('projectManagerPage.costPractice.views.estimateQuota'),
    estimateIndicator: t('projectManagerPage.costPractice.views.estimateIndicator'),
    investmentIndicator: t('projectManagerPage.costPractice.views.investmentIndicator'),
  }
  const viewCurrentLabel =
    viewMenuMode === 'resourceQuota'
      ? quotaLabelByMode[quotaView]
      : viewMenuMode === 'costQuota'
        ? costQuotaLabelByMode[costQuotaView as CostPracticeQuotaView]
        : viewLabelByMode[scheduleView]
  const baselineMenuLabel = t('projectManagerPage.files.menu.baseline')
  const resourceStatsMenuLabel = t('projectManagerPage.files.menu.resourceStatistics')
  const resourceStatMode = isFeaturesResourceStatFilter(selectedType)
  const resourceStatCurrent = resourceStatMode ? selectedType : null
  const viewLabel = t('projectManagerPage.files.menu.view')

  return {
    t,
    viewOpen,
    setViewOpen,
    resourceStatsOpen,
    setResourceStatsOpen,
    baselineOpen,
    setBaselineOpen,
    viewRef,
    resourceStatsRef,
    baselineRef,
    viewPos,
    resourceStatsPos,
    baselinePos,
    viewLabelByMode,
    quotaLabelByMode,
    costQuotaLabelByMode,
    viewCurrentLabel,
    baselineMenuLabel,
    resourceStatsMenuLabel,
    resourceStatMode,
    resourceStatCurrent,
    viewLabel,
  }
}
