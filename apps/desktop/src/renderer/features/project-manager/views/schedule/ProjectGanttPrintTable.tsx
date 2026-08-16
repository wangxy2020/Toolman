import type { FC } from 'react'

import type { PmWorkItemRelation } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import type { PmResourceRow, PmResourceType } from '../resource/pm-resource-catalog'
import type { GanttTreeRow } from './pm-gantt-tree'
import type { GanttUiPrefs } from './pm-gantt-prefs'
import { buildScheduleTimeline } from './pm-gantt-utils'
import type { GanttColumnLabels } from './ProjectGanttTaskGrid'
import { ganttPrintColumnWidth } from './project-gantt-print-table-cells'
import ProjectGanttPrintTableBody from './ProjectGanttPrintTableBody'
import ProjectGanttPrintTableHeader from './ProjectGanttPrintTableHeader'

type ScheduleTimeline = ReturnType<typeof buildScheduleTimeline>

type Props = {
  rows: GanttTreeRow[]
  relations: PmWorkItemRelation[]
  indexById: Map<string, number>
  criticalIds: ReadonlySet<string>
  prefs: GanttUiPrefs
  builtinLabels: GanttColumnLabels
  timeline: ScheduleTimeline
  baselineByItemId: Map<string, { startDate?: number; dueDate?: number }>
  showYearRow: boolean
  showMonthRow: boolean
  showWeekRow: boolean
  showDayRow: boolean
  headerHeight: number
  resourceCatalog?: readonly PmResourceRow[]
}

/** Print-only table so Chromium repeats <thead> on every page (no position:fixed). */
const ProjectGanttPrintTable: FC<Props> = ({
  rows,
  relations,
  indexById,
  criticalIds,
  prefs,
  builtinLabels,
  timeline,
  baselineByItemId,
  showYearRow,
  showMonthRow,
  showWeekRow,
  showDayRow,
  headerHeight,
  resourceCatalog = [],
}) => {
  const { t } = useI18n()
  const dayUnit = t('projectManagerPage.schedule.dayUnit')
  const typeLabel = (type: PmResourceType) =>
    t(`projectManagerPage.resourceTable.types.${type}`)
  const columns = prefs.columnOrder.filter((columnId) => columnId !== 'spacer')

  return (
    <table className="tm-pm-gantt-print-table">
      <colgroup>
        {columns.map((columnId) => (
          <col key={columnId} style={{ width: ganttPrintColumnWidth(columnId) }} />
        ))}
        <col className="tm-pm-gantt-print-chart-col" />
      </colgroup>
      <ProjectGanttPrintTableHeader
        columns={columns}
        prefs={prefs}
        builtinLabels={builtinLabels}
        timeline={timeline}
        showYearRow={showYearRow}
        showMonthRow={showMonthRow}
        showWeekRow={showWeekRow}
        showDayRow={showDayRow}
        headerHeight={headerHeight}
      />
      <ProjectGanttPrintTableBody
        rows={rows}
        columns={columns}
        relations={relations}
        indexById={indexById}
        criticalIds={criticalIds}
        timeline={timeline}
        baselineByItemId={baselineByItemId}
        resourceCatalog={resourceCatalog}
        dayUnit={dayUnit}
        typeLabel={typeLabel}
      />
    </table>
  )
}

export default ProjectGanttPrintTable
