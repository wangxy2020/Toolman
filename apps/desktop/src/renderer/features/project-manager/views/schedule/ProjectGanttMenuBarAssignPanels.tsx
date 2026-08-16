import {
  GANTT_COST_ASSIGN_MENU_TYPES,
  GANTT_RESOURCE_ASSIGN_MENU_TYPES,
  type GanttAssignTypeFilter,
  type GanttScheduleView,
} from './pm-gantt-prefs'
import { renderGanttMenuPanel } from './pm-gantt-menubar-items'
import type { GanttMenuAction } from './ProjectGanttMenuBarTypes'
import type { GanttMenuDropdownKey } from './useProjectGanttMenuBar'

export function ProjectGanttMenuBarNodePanel(props: {
  nodePos: { top: number; left: number } | null
  t: (key: string) => string
}) {
  return renderGanttMenuPanel(
    props.nodePos,
    <div className="tm-pm-gantt-submenu-empty">
      {props.t('projectManagerPage.schedule.menu.nodePlaceholder')}
    </div>,
  )
}

export function ProjectGanttMenuBarResourceAssignPanel(props: {
  resourceAssignPos: { top: number; left: number } | null
  scheduleView: GanttScheduleView
  resourceTypeFilter: GanttAssignTypeFilter
  onResourceTypeFilterChange?: (filter: GanttAssignTypeFilter) => void
  setOpenMenu: (key: GanttMenuDropdownKey | null) => void
  t: (key: string) => string
}) {
  return renderGanttMenuPanel(
    props.resourceAssignPos,
    <>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={props.scheduleView === 'resource' && props.resourceTypeFilter === 'all'}
        className={[
          'tm-pm-gantt-view-option',
          props.scheduleView === 'resource' && props.resourceTypeFilter === 'all'
            ? 'tm-pm-gantt-view-option--active'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          props.onResourceTypeFilterChange?.('all')
          props.setOpenMenu(null)
        }}
      >
        {props.t('projectManagerPage.schedule.menu.assignAll')}
      </button>
      {GANTT_RESOURCE_ASSIGN_MENU_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="menuitemradio"
          aria-checked={props.scheduleView === 'resource' && props.resourceTypeFilter === type}
          className={[
            'tm-pm-gantt-view-option',
            props.scheduleView === 'resource' && props.resourceTypeFilter === type
              ? 'tm-pm-gantt-view-option--active'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            props.onResourceTypeFilterChange?.(type)
            props.setOpenMenu(null)
          }}
        >
          {props.t(`projectManagerPage.resourceTable.types.${type}`)}
        </button>
      ))}
    </>,
  )
}

export function ProjectGanttMenuBarCostAssignPanel(props: {
  costAssignPos: { top: number; left: number } | null
  scheduleView: GanttScheduleView
  costTypeFilter: GanttAssignTypeFilter
  onCostTypeFilterChange?: (filter: GanttAssignTypeFilter) => void
  setOpenMenu: (key: GanttMenuDropdownKey | null) => void
  t: (key: string) => string
}) {
  return renderGanttMenuPanel(
    props.costAssignPos,
    <>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={props.scheduleView === 'cost' && props.costTypeFilter === 'all'}
        className={[
          'tm-pm-gantt-view-option',
          props.scheduleView === 'cost' && props.costTypeFilter === 'all'
            ? 'tm-pm-gantt-view-option--active'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          props.onCostTypeFilterChange?.('all')
          props.setOpenMenu(null)
        }}
      >
        {props.t('projectManagerPage.schedule.menu.assignAll')}
      </button>
      {GANTT_COST_ASSIGN_MENU_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="menuitemradio"
          aria-checked={props.scheduleView === 'cost' && props.costTypeFilter === type}
          className={[
            'tm-pm-gantt-view-option',
            props.scheduleView === 'cost' && props.costTypeFilter === type
              ? 'tm-pm-gantt-view-option--active'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            props.onCostTypeFilterChange?.(type)
            props.setOpenMenu(null)
          }}
        >
          {props.t(`projectManagerPage.costTable.types.${type}`)}
        </button>
      ))}
    </>,
  )
}

export function ProjectGanttMenuBarSmartAssignPanel(props: {
  smartAssignPos: { top: number; left: number } | null
  onAction: (action: GanttMenuAction) => void
  setOpenMenu: (key: GanttMenuDropdownKey | null) => void
  t: (key: string) => string
}) {
  return renderGanttMenuPanel(
    props.smartAssignPos,
    <>
      <button
        type="button"
        role="menuitem"
        className="tm-pm-gantt-view-option"
        onClick={() => {
          props.onAction('autoAssignResource')
          props.setOpenMenu(null)
        }}
      >
        {props.t('projectManagerPage.schedule.menu.autoAssignResource')}
      </button>
      <button
        type="button"
        role="menuitem"
        className="tm-pm-gantt-view-option"
        onClick={() => {
          props.onAction('autoAssignCost')
          props.setOpenMenu(null)
        }}
      >
        {props.t('projectManagerPage.schedule.menu.autoAssignCost')}
      </button>
    </>,
  )
}

export function ProjectGanttMenuBarAnalysisPanel(props: {
  analysisPos: { top: number; left: number } | null
  onAction: (action: GanttMenuAction) => void
  setOpenMenu: (key: GanttMenuDropdownKey | null) => void
  t: (key: string) => string
}) {
  return renderGanttMenuPanel(
    props.analysisPos,
    <button
      type="button"
      role="menuitem"
      className="tm-pm-gantt-view-option"
      onClick={() => {
        props.onAction('openAnalysis')
        props.setOpenMenu(null)
      }}
    >
      {props.t('projectManagerPage.schedule.menu.openAnalysis')}
    </button>,
  )
}
