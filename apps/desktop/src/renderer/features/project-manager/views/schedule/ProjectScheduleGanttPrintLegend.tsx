import type { CSSProperties } from 'react'

interface TaskColors {
  task: string
  critical: string
  summary: string
  milestone: string
}

interface Props {
  t: (key: string) => string
  taskColors: TaskColors
}

export function ProjectScheduleGanttPrintLegend({ t, taskColors }: Props) {
  return (
    <>
      <div className="tm-pm-gantt-print-legend" aria-hidden>
        <span className="tm-pm-gantt-print-legend-title">
          {t('projectManagerPage.schedule.print.legend')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span
            className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--task"
            style={{ background: taskColors.task } as CSSProperties}
          />
          {t('projectManagerPage.schedule.print.legendTask')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span
            className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--critical"
            style={{ background: taskColors.critical } as CSSProperties}
          />
          {t('projectManagerPage.schedule.print.legendCritical')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span
            className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--summary"
            style={{ background: taskColors.summary } as CSSProperties}
          />
          {t('projectManagerPage.schedule.print.legendSummary')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span
            className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--milestone"
            style={{ background: taskColors.milestone } as CSSProperties}
          />
          {t('projectManagerPage.schedule.print.legendMilestone')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--baseline" />
          {t('projectManagerPage.schedule.print.legendBaseline')}
        </span>
      </div>
      {/* Page numbers come from @page @bottom-center; keep a hidden stub for a11y/DOM stability. */}
      <div className="tm-pm-gantt-print-footer" aria-hidden />
    </>
  )
}
