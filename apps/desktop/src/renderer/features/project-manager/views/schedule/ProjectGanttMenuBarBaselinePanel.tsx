import type { BaselineCompareMode } from './pm-gantt-baseline-compare'
import { formatBaselineCaptureTime } from './pm-gantt-baseline-compare'
import { formatWorkItemDate } from './pm-gantt-utils'
import { renderGanttMenuPanel } from './pm-gantt-menubar-items'
import type { GanttMenuAction, GanttVersionSwitchEntry } from './ProjectGanttMenuBarTypes'
import type { GanttMenuDropdownKey } from './useProjectGanttMenuBar'

export function ProjectGanttMenuBarBaselinePanel(props: {
  baselinePos: { top: number; left: number } | null
  hasProject: boolean
  baselines: Array<{
    id: string
    name: string
    createdAt: number
    capturedAt: number
    asOfDate?: number
  }>
  selectedBaselineId: string | null
  onSelectBaseline: (id: string | null) => void
  baselineCompareMode: BaselineCompareMode
  onBaselineCompareModeChange: (mode: BaselineCompareMode) => void
  versionSwitchEntries: GanttVersionSwitchEntry[]
  onRestoreBaseline: (id: string) => void
  onAction: (action: GanttMenuAction) => void
  setOpenMenu: (key: GanttMenuDropdownKey | null) => void
  t: (key: string, vars?: Record<string, string>) => string
}) {
  return renderGanttMenuPanel(
    props.baselinePos,
    <>
      <button
        type="button"
        role="menuitem"
        className="tm-pm-gantt-view-option"
        disabled={!props.hasProject}
        onClick={() => {
          props.onAction('captureBaseline')
          props.setOpenMenu(null)
        }}
      >
        {props.t('projectManagerPage.schedule.captureBaseline')}
      </button>

      <div className="tm-pm-gantt-submenu-title">
        {props.t('projectManagerPage.schedule.baselineCompareMode')}
      </div>
      {(
        [
          ['none', 'baselineCompareNone'],
          ['gantt', 'baselineCompareGantt'],
          ['progressLine', 'baselineCompareProgressLine'],
        ] as const
      ).map(([mode, labelKey]) => (
        <button
          key={mode}
          type="button"
          role="menuitemradio"
          aria-checked={props.baselineCompareMode === mode}
          className={[
            'tm-pm-gantt-view-option',
            props.baselineCompareMode === mode ? 'tm-pm-gantt-view-option--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            props.onBaselineCompareModeChange(mode)
            if (mode === 'none') props.onSelectBaseline(null)
            props.setOpenMenu(null)
          }}
        >
          {props.t(`projectManagerPage.schedule.${labelKey}`)}
        </button>
      ))}

      <div className="tm-pm-gantt-submenu-title">
        {props.t('projectManagerPage.schedule.baselineSelect')}
      </div>
      {props.baselines.length === 0 ? (
        <div className="tm-pm-gantt-submenu-empty">
          {props.t('projectManagerPage.schedule.baselineEmpty')}
        </div>
      ) : (
        props.baselines.map((entry) => {
          const asOfLabel = entry.asOfDate != null ? formatWorkItemDate(entry.asOfDate) : ''
          const nameWithoutDate = entry.name
            .replace(/\s*[（(]\d{4}-\d{2}-\d{2}[）)]\s*$/u, '')
            .trim()
          const label = asOfLabel !== '' ? `${nameWithoutDate} (${asOfLabel})` : entry.name
          return (
            <button
              key={`compare-${entry.id}`}
              type="button"
              role="menuitemradio"
              aria-checked={props.selectedBaselineId === entry.id}
              className={[
                'tm-pm-gantt-view-option',
                'tm-pm-gantt-view-option--baseline',
                props.selectedBaselineId === entry.id ? 'tm-pm-gantt-view-option--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (props.baselineCompareMode === 'none') {
                  props.onBaselineCompareModeChange('gantt')
                }
                props.onSelectBaseline(
                  props.selectedBaselineId === entry.id ? null : entry.id,
                )
              }}
            >
              <span className="tm-pm-gantt-baseline-option-name">{label}</span>
              <span className="tm-pm-gantt-baseline-option-time">
                {formatBaselineCaptureTime(entry.capturedAt || entry.createdAt)}
              </span>
            </button>
          )
        })
      )}

      <div className="tm-pm-gantt-submenu-title">
        {props.t('projectManagerPage.schedule.versionSwitch')}
      </div>
      {props.versionSwitchEntries.length === 0 ? (
        <div className="tm-pm-gantt-submenu-empty">
          {props.t('projectManagerPage.schedule.versionSwitchEmpty')}
        </div>
      ) : (
        props.versionSwitchEntries.map((entry) => {
          const canSwitch = entry.baselineId != null
          return (
            <button
              key={`restore-v-${entry.version}`}
              type="button"
              role="menuitem"
              className="tm-pm-gantt-view-option"
              disabled={!canSwitch}
              title={
                canSwitch
                  ? undefined
                  : props.t('projectManagerPage.schedule.versionSwitchNoSnapshot')
              }
              onClick={() => {
                if (!entry.baselineId) return
                props.onRestoreBaseline(entry.baselineId)
                props.setOpenMenu(null)
              }}
            >
              {props.t('projectManagerPage.schedule.switchToVersion', { name: entry.name })}
              {entry.isCurrent
                ? ` · ${props.t('projectManagerPage.projectInfo.saveHistoryCurrent')}`
                : ''}
              {!canSwitch
                ? ` · ${props.t('projectManagerPage.schedule.versionSwitchNoSnapshotShort')}`
                : ''}
            </button>
          )
        })
      )}

      <button
        type="button"
        role="menuitem"
        className="tm-pm-gantt-view-option"
        disabled={!props.selectedBaselineId}
        onClick={() => {
          props.onAction('editBaseline')
          props.setOpenMenu(null)
        }}
      >
        {props.t('projectManagerPage.schedule.editBaseline')}
      </button>

      <button
        type="button"
        role="menuitem"
        className="tm-pm-gantt-view-option"
        disabled={!props.selectedBaselineId}
        onClick={() => {
          props.onAction('deleteBaseline')
        }}
      >
        {props.t('projectManagerPage.schedule.deleteBaseline')}
      </button>
    </>,
  )
}
