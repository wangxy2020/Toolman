import type { RefObject } from 'react'

import { IconChevronDown } from '../../../../components/icons'
import type { GanttScheduleView } from './pm-gantt-prefs'
import { renderGanttMenuPanel } from './pm-gantt-menubar-items'
import type { GanttLeafTaskType, GanttMenuAction } from './ProjectGanttMenuBarTypes'
import type { GanttMenuDropdownKey } from './useProjectGanttMenuBar'

export function ProjectGanttMenuBarViewOptions(props: {
  viewPos: { top: number; left: number } | null
  scheduleView: GanttScheduleView
  viewLabelByMode: Record<GanttScheduleView, string>
  onScheduleViewChange: (view: GanttScheduleView) => void
  setOpenMenu: (key: GanttMenuDropdownKey | null) => void
}) {
  return renderGanttMenuPanel(
    props.viewPos,
    (['list', 'gantt', 'progressCheck', 'resource', 'cost'] as const).map((view) => (
      <button
        key={view}
        type="button"
        role="menuitemradio"
        aria-checked={props.scheduleView === view}
        className={[
          'tm-pm-gantt-view-option',
          props.scheduleView === view ? 'tm-pm-gantt-view-option--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          props.onScheduleViewChange(view)
          props.setOpenMenu(null)
        }}
      >
        {props.viewLabelByMode[view]}
      </button>
    )),
  )
}

export function ProjectGanttMenuBarTypeMenu(props: {
  typeRef: RefObject<HTMLSpanElement | null>
  typePos: { top: number; left: number } | null
  openMenu: GanttMenuDropdownKey | null
  typeLabel: string
  selectedTaskType: GanttLeafTaskType
  disabled: boolean
  structureLocked: boolean
  canSetTaskType: boolean
  hideTip: () => void
  toggleMenu: (key: GanttMenuDropdownKey) => void
  tipProps: (title: string) => Record<string, unknown>
  t: (key: string) => string
  onAction: (action: GanttMenuAction) => void
  setOpenMenu: (key: GanttMenuDropdownKey | null) => void
}) {
  const buttonDisabled = props.disabled || props.structureLocked || !props.canSetTaskType
  return (
    <span className="tm-pm-gantt-menubar-item tm-pm-gantt-type-menu" ref={props.typeRef}>
      <button
        type="button"
        className="tm-pm-gantt-menubar-btn"
        aria-label={props.t('projectManagerPage.schedule.menu.taskType')}
        aria-disabled={buttonDisabled}
        aria-expanded={props.openMenu === 'type'}
        onClick={() => {
          if (buttonDisabled) return
          props.hideTip()
          props.toggleMenu('type')
        }}
        {...props.tipProps(props.t('projectManagerPage.schedule.menu.taskType'))}
      >
        <span className="tm-pm-gantt-view-current">{props.typeLabel}</span>
        <IconChevronDown size={14} />
      </button>
      {props.openMenu === 'type' &&
        renderGanttMenuPanel(
          props.typePos,
          <>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={props.selectedTaskType === 'task'}
              className={[
                'tm-pm-gantt-view-option',
                props.selectedTaskType === 'task' ? 'tm-pm-gantt-view-option--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                props.onAction('setTask')
                props.setOpenMenu(null)
              }}
            >
              {props.t('projectManagerPage.schedule.menu.setTask')}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={props.selectedTaskType === 'milestone'}
              className={[
                'tm-pm-gantt-view-option',
                props.selectedTaskType === 'milestone' ? 'tm-pm-gantt-view-option--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                props.onAction('setMilestone')
                props.setOpenMenu(null)
              }}
            >
              {props.t('projectManagerPage.schedule.menu.setMilestone')}
            </button>
          </>,
          'tm-pm-gantt-view-panel tm-pm-gantt-type-panel',
        )}
      <span className="tm-pm-gantt-menubar-divider" />
    </span>
  )
}
