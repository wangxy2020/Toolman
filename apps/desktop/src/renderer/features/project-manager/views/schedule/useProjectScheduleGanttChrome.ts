import type { UIEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import type { GanttColumnLabels } from './ProjectGanttTaskGrid'
import { loadGanttUiPrefs, saveGanttUiPrefs, type GanttUiPrefs } from './pm-gantt-prefs'

export function useProjectScheduleGanttChrome(args: {
  selectedProjectId: string | null
  projectCount: number
}) {
  const { selectedProjectId, projectCount } = args
  const { t } = useI18n()
  const [uiPrefs, setUiPrefs] = useState<GanttUiPrefs>(() => loadGanttUiPrefs())
  const [chartPaneWidth, setChartPaneWidth] = useState(600)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const panelRootRef = useRef<HTMLDivElement>(null)
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const chartHeaderScrollRef = useRef<HTMLDivElement>(null)
  const chartPaneRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)

  const builtinLabels = useMemo<GanttColumnLabels>(
    () => ({
      index: t('projectManagerPage.schedule.columns.index'),
      name: t('projectManagerPage.schedule.columns.name'),
      duration: t('projectManagerPage.schedule.columns.duration'),
      start: t('projectManagerPage.schedule.columns.start'),
      finish: t('projectManagerPage.schedule.columns.finish'),
      predecessors: t('projectManagerPage.schedule.columns.predecessors'),
      actualStart: t('projectManagerPage.schedule.columns.actualStart'),
      actualFinish: t('projectManagerPage.schedule.columns.actualFinish'),
      shouldPercentComplete: t('projectManagerPage.schedule.columns.shouldPercentComplete'),
      percentComplete: t('projectManagerPage.schedule.columns.percentComplete'),
      variance: t('projectManagerPage.schedule.columns.variance'),
    }),
    [t],
  )

  const handlePrefsChange = useCallback((next: GanttUiPrefs) => {
    setUiPrefs(next)
    saveGanttUiPrefs(next)
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'tm-pm-gantt-ui-prefs') {
        setUiPrefs(loadGanttUiPrefs())
      }
    }
    window.addEventListener('storage', onStorage)
    const onPrefsEvent = () => setUiPrefs(loadGanttUiPrefs())
    window.addEventListener('tm-pm-gantt-prefs', onPrefsEvent)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('tm-pm-gantt-prefs', onPrefsEvent)
    }
  }, [])

  useEffect(() => {
    const pane = chartPaneRef.current
    if (!pane) return
    const update = () => {
      // Use content box width so the fitted timeline never exceeds the visible area.
      const width = Math.floor(pane.getBoundingClientRect().width)
      if (width > 0) setChartPaneWidth(width)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(pane)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [projectCount, selectedProjectId, uiPrefs.scheduleView])
  const syncScroll = (source: 'grid' | 'chart') => (event: UIEvent<HTMLDivElement>) => {
    if (syncingScroll.current) return
    const top = event.currentTarget.scrollTop
    const target = source === 'grid' ? chartScrollRef.current : gridScrollRef.current
    if (!target || target.scrollTop === top) return
    syncingScroll.current = true
    target.scrollTop = top
    requestAnimationFrame(() => {
      syncingScroll.current = false
    })
  }

  const syncChartHorizontal = (source: 'header' | 'body') => (event: UIEvent<HTMLDivElement>) => {
    if (syncingScroll.current) return
    const left = event.currentTarget.scrollLeft
    const target = source === 'header' ? chartScrollRef.current : chartHeaderScrollRef.current
    if (!target || target.scrollLeft === left) return
    syncingScroll.current = true
    target.scrollLeft = left
    requestAnimationFrame(() => {
      syncingScroll.current = false
    })
  }

  const handleGridWheelScroll = (deltaY: number) => {
    const chart = chartScrollRef.current
    const grid = gridScrollRef.current
    if (!chart) return
    chart.scrollTop += deltaY
    if (grid) grid.scrollTop = chart.scrollTop
  }

  return {
    t,
    uiPrefs,
    setUiPrefs,
    handlePrefsChange,
    chartPaneWidth,
    projectInfoOpen,
    setProjectInfoOpen,
    panelRootRef,
    gridScrollRef,
    chartScrollRef,
    chartHeaderScrollRef,
    chartPaneRef,
    builtinLabels,
    syncScroll,
    syncChartHorizontal,
    handleGridWheelScroll,
  }
}
