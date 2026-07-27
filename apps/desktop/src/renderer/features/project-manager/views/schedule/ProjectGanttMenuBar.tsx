import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronDown,
  IconChevronUp,
  IconIndent,
  IconInsertRow,
  IconLink,
  IconOutdent,
  IconPlus,
  IconPrint,
  IconProjectInfo,
  IconRedo,
  IconSave,
  IconSaveAsNewVersion,
  IconTrash,
  IconUndo,
} from '../../../../components/icons'
import { useMenuBarHScroll, useMenuBarTooltip } from '../../pm-menubar-chrome'
import type { BaselineCompareMode } from './pm-gantt-baseline-compare'
import { formatBaselineCaptureTime } from './pm-gantt-baseline-compare'
import { formatWorkItemDate } from './pm-gantt-utils'
import type { GanttScheduleView } from './pm-gantt-prefs'
import {
  GANTT_COST_ASSIGN_MENU_TYPES,
  GANTT_RESOURCE_ASSIGN_MENU_TYPES,
  type GanttAssignTypeFilter,
} from './pm-gantt-prefs'
import { useProjectGanttMenuBar, type GanttMenuDropdownKey } from './useProjectGanttMenuBar'

const ICON_SIZE = 16

export type GanttMenuAction =
  | 'save'
  | 'saveAsNewVersion'
  | 'print'
  | 'projectInfo'
  | 'link'
  | 'undo'
  | 'redo'
  | 'newTask'
  | 'insertTask'
  | 'deleteTask'
  | 'indent'
  | 'outdent'
  | 'setTask'
  | 'setMilestone'
  | 'moveUp'
  | 'moveDown'
  | 'captureBaseline'
  | 'editBaseline'
  | 'deleteBaseline'
  | 'openResource'
  | 'openCost'
  | 'autoAssignResource'
  | 'autoAssignCost'
  | 'openAnalysis'

export type GanttLeafTaskType = 'task' | 'milestone'

export type GanttVersionSwitchEntry = {
  version: number
  name: string
  baselineId: string | null
  isCurrent: boolean
}

type MenuItem = {
  key: GanttMenuAction
  title: string
  label: ReactNode
  disabled?: boolean
  dividerAfter?: boolean
  icon?: boolean
}

export interface ProjectGanttMenuBarProps {
  disabled?: boolean
  hasSelection: boolean
  hasProject?: boolean
  canUndo?: boolean
  canRedo?: boolean
  canSetTaskType: boolean
  selectedTaskType: GanttLeafTaskType
  scheduleView: GanttScheduleView
  onScheduleViewChange: (view: GanttScheduleView) => void
  resourceTypeFilter?: GanttAssignTypeFilter
  costTypeFilter?: GanttAssignTypeFilter
  onResourceTypeFilterChange?: (filter: GanttAssignTypeFilter) => void
  onCostTypeFilterChange?: (filter: GanttAssignTypeFilter) => void
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
}

type Props = ProjectGanttMenuBarProps

export function ProjectGanttMenuBar({
  disabled = false,
  hasSelection,
  hasProject = true,
  canUndo = false,
  canRedo = false,
  canSetTaskType,
  selectedTaskType,
  scheduleView,
  onScheduleViewChange,
  resourceTypeFilter = 'all',
  costTypeFilter = 'all',
  onResourceTypeFilterChange,
  onCostTypeFilterChange,
  baselines,
  selectedBaselineId,
  onSelectBaseline,
  baselineCompareMode,
  onBaselineCompareModeChange,
  versionSwitchEntries,
  onRestoreBaseline,
  onAction,
}: Props) {
  const {
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
  } = useProjectGanttMenuBar({ scheduleView, selectedTaskType })
  const { tooltip, hideTip, tipProps } = useMenuBarTooltip()
  const { scrollRef, trackRef, scrollMetrics, syncScrollMetrics, onTrackPointerDown } =
    useMenuBarHScroll()

  const items: MenuItem[] = [
    {
      key: 'save',
      title: t('projectManagerPage.schedule.menu.save'),
      label: <IconSave size={ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'saveAsNewVersion',
      title: t('projectManagerPage.schedule.menu.saveAsNewVersion'),
      label: <IconSaveAsNewVersion size={ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'print',
      title: t('projectManagerPage.schedule.menu.print'),
      label: <IconPrint size={ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'projectInfo',
      title: t('projectManagerPage.schedule.menu.projectInfo'),
      label: <IconProjectInfo size={ICON_SIZE} />,
      icon: true,
      disabled: !hasProject,
    },
    {
      key: 'link',
      title: t('projectManagerPage.schedule.menu.link'),
      label: <IconLink size={ICON_SIZE} />,
      icon: true,
      disabled: true,
    },
    {
      key: 'undo',
      title: t('projectManagerPage.schedule.menu.undo'),
      label: <IconUndo size={ICON_SIZE} />,
      icon: true,
      disabled: !canUndo,
    },
    {
      key: 'redo',
      title: t('projectManagerPage.schedule.menu.redo'),
      label: <IconRedo size={ICON_SIZE} />,
      icon: true,
      disabled: !canRedo,
      dividerAfter: true,
    },
    {
      key: 'newTask',
      title: t('projectManagerPage.schedule.menu.newTask'),
      label: <IconPlus size={ICON_SIZE} />,
      icon: true,
      disabled: structureLocked,
    },
    {
      key: 'insertTask',
      title: t('projectManagerPage.schedule.menu.insertTask'),
      label: <IconInsertRow size={ICON_SIZE} />,
      icon: true,
      disabled: structureLocked,
    },
    {
      key: 'deleteTask',
      title: t('projectManagerPage.schedule.menu.deleteTask'),
      label: <IconTrash size={ICON_SIZE} />,
      icon: true,
      disabled: structureLocked || !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.schedule.menu.indent'),
      label: <IconIndent size={ICON_SIZE} />,
      icon: true,
      disabled: structureLocked || !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.schedule.menu.outdent'),
      label: <IconOutdent size={ICON_SIZE} />,
      icon: true,
      disabled: structureLocked || !hasSelection,
    },
    {
      key: 'moveUp',
      title: t('projectManagerPage.schedule.menu.moveUp'),
      label: <IconChevronUp size={ICON_SIZE} />,
      disabled: structureLocked || !hasSelection,
      icon: true,
    },
    {
      key: 'moveDown',
      title: t('projectManagerPage.schedule.menu.moveDown'),
      label: <IconChevronDown size={ICON_SIZE} />,
      disabled: structureLocked || !hasSelection,
      icon: true,
    },
  ]

  const leadingItems = items.slice(0, 9)
  const hierarchyItems = items.slice(9, 11)
  const moveItems = items.slice(11)

  const renderToolbarItem = (item: MenuItem) => {
    const isDisabled = Boolean(disabled || item.disabled)
    return (
      <span key={item.key} className="tm-pm-gantt-menubar-item">
        <button
          type="button"
          className={[
            'tm-pm-gantt-menubar-btn',
            item.icon ? 'tm-pm-gantt-menubar-btn--icon' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={item.title}
          aria-disabled={isDisabled}
          onClick={() => {
            if (isDisabled) return
            hideTip()
            onAction(item.key)
          }}
          {...tipProps(item.title)}
        >
          {item.label}
        </button>
        {item.dividerAfter ? <span className="tm-pm-gantt-menubar-divider" /> : null}
      </span>
    )
  }

  const renderPanel = (
    pos: { top: number; left: number } | null,
    children: ReactNode,
    className = 'tm-pm-gantt-view-panel',
  ) =>
    pos
      ? createPortal(
          <div className={className} role="menu" style={{ top: pos.top, left: pos.left }}>
            {children}
          </div>,
          document.body,
        )
      : null

  const renderMenuButton = (
    key: GanttMenuDropdownKey,
    ref: React.RefObject<HTMLSpanElement | null>,
    label: string,
    options?: {
      current?: string
      active?: boolean
      dividerAfter?: boolean
      buttonDisabled?: boolean
    },
  ) => {
    const buttonDisabled = options?.buttonDisabled ?? disabled
    const dividerAfter = options?.dividerAfter !== false
    return (
      <span className="tm-pm-gantt-menubar-item tm-pm-gantt-view-menu" ref={ref}>
        <button
          type="button"
          className={[
            'tm-pm-gantt-menubar-btn',
            options?.active ? 'tm-pm-gantt-menubar-btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={label}
          aria-disabled={buttonDisabled}
          aria-expanded={openMenu === key}
          onClick={() => {
            if (buttonDisabled) return
            hideTip()
            toggleMenu(key)
          }}
          {...tipProps(label)}
        >
          <span>{label}</span>
          {options?.current ? (
            <span className="tm-pm-gantt-view-current">{options.current}</span>
          ) : null}
          <IconChevronDown size={14} />
        </button>
        {dividerAfter ? <span className="tm-pm-gantt-menubar-divider" /> : null}
      </span>
    )
  }

  return (
    <div
      className={[
        'tm-pm-gantt-menubar',
        scrollMetrics.overflowing ? 'tm-pm-gantt-menubar--overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
      aria-label={t('projectManagerPage.schedule.menu.barLabel')}>
      <div className="tm-pm-gantt-menubar-main">
        <div
          ref={scrollRef}
          className="tm-pm-gantt-menubar-scroll"
          onScroll={() => {
            hideTip()
            syncScrollMetrics()
          }}
        >
          <div className="tm-pm-gantt-menubar-group">
            {renderMenuButton(
              'view',
              viewRef,
              t('projectManagerPage.schedule.menu.view'),
              { current: viewLabelByMode[scheduleView] },
            )}
            {openMenu === 'view' &&
              renderPanel(
                viewPos,
                (['list', 'gantt', 'progressCheck', 'resource', 'cost'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    role="menuitemradio"
                    aria-checked={scheduleView === view}
                    className={[
                      'tm-pm-gantt-view-option',
                      scheduleView === view ? 'tm-pm-gantt-view-option--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      onScheduleViewChange(view)
                      setOpenMenu(null)
                    }}>
                    {viewLabelByMode[view]}
                  </button>
                )),
              )}

            {leadingItems.map(renderToolbarItem)}
            {hierarchyItems.map(renderToolbarItem)}

            <span className="tm-pm-gantt-menubar-item tm-pm-gantt-type-menu" ref={typeRef}>
              <button
                type="button"
                className="tm-pm-gantt-menubar-btn"
                aria-label={t('projectManagerPage.schedule.menu.taskType')}
                aria-disabled={disabled || structureLocked || !canSetTaskType}
                aria-expanded={openMenu === 'type'}
                onClick={() => {
                  if (disabled || structureLocked || !canSetTaskType) return
                  hideTip()
                  toggleMenu('type')
                }}
                {...tipProps(t('projectManagerPage.schedule.menu.taskType'))}
              >
                <span className="tm-pm-gantt-view-current">{typeLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {openMenu === 'type' &&
                renderPanel(
                  typePos,
                  <>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedTaskType === 'task'}
                      className={[
                        'tm-pm-gantt-view-option',
                        selectedTaskType === 'task' ? 'tm-pm-gantt-view-option--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        onAction('setTask')
                        setOpenMenu(null)
                      }}>
                      {t('projectManagerPage.schedule.menu.setTask')}
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedTaskType === 'milestone'}
                      className={[
                        'tm-pm-gantt-view-option',
                        selectedTaskType === 'milestone' ? 'tm-pm-gantt-view-option--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        onAction('setMilestone')
                        setOpenMenu(null)
                      }}>
                      {t('projectManagerPage.schedule.menu.setMilestone')}
                    </button>
                  </>,
                  'tm-pm-gantt-view-panel tm-pm-gantt-type-panel',
                )}
              <span className="tm-pm-gantt-menubar-divider" />
            </span>

            {moveItems.map(renderToolbarItem)}

            {renderMenuButton(
              'baseline',
              baselineRef,
              t('projectManagerPage.schedule.menu.baseline'),
              { buttonDisabled: disabled || structureLocked, dividerAfter: false },
            )}
            {openMenu === 'baseline' &&
              renderPanel(
                baselinePos,
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="tm-pm-gantt-view-option"
                    disabled={!hasProject}
                    onClick={() => {
                      onAction('captureBaseline')
                      setOpenMenu(null)
                    }}>
                    {t('projectManagerPage.schedule.captureBaseline')}
                  </button>

                  <div className="tm-pm-gantt-submenu-title">
                    {t('projectManagerPage.schedule.baselineCompareMode')}
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
                      aria-checked={baselineCompareMode === mode}
                      className={[
                        'tm-pm-gantt-view-option',
                        baselineCompareMode === mode ? 'tm-pm-gantt-view-option--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        onBaselineCompareModeChange(mode)
                        if (mode === 'none') onSelectBaseline(null)
                        setOpenMenu(null)
                      }}>
                      {t(`projectManagerPage.schedule.${labelKey}`)}
                    </button>
                  ))}

                  <div className="tm-pm-gantt-submenu-title">
                    {t('projectManagerPage.schedule.baselineSelect')}
                  </div>
                  {baselines.length === 0 ? (
                    <div className="tm-pm-gantt-submenu-empty">
                      {t('projectManagerPage.schedule.baselineEmpty')}
                    </div>
                  ) : (
                    baselines.map((entry) => {
                      const asOfLabel =
                        entry.asOfDate != null ? formatWorkItemDate(entry.asOfDate) : ''
                      const nameWithoutDate = entry.name
                        .replace(/\s*[（(]\d{4}-\d{2}-\d{2}[）)]\s*$/u, '')
                        .trim()
                      const label =
                        asOfLabel !== ''
                          ? `${nameWithoutDate} (${asOfLabel})`
                          : entry.name
                      return (
                        <button
                          key={`compare-${entry.id}`}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedBaselineId === entry.id}
                          className={[
                            'tm-pm-gantt-view-option',
                            'tm-pm-gantt-view-option--baseline',
                            selectedBaselineId === entry.id
                              ? 'tm-pm-gantt-view-option--active'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            if (baselineCompareMode === 'none') {
                              onBaselineCompareModeChange('gantt')
                            }
                            onSelectBaseline(
                              selectedBaselineId === entry.id ? null : entry.id,
                            )
                          }}>
                          <span className="tm-pm-gantt-baseline-option-name">{label}</span>
                          <span className="tm-pm-gantt-baseline-option-time">
                            {formatBaselineCaptureTime(entry.capturedAt || entry.createdAt)}
                          </span>
                        </button>
                      )
                    })
                  )}

                  <div className="tm-pm-gantt-submenu-title">
                    {t('projectManagerPage.schedule.versionSwitch')}
                  </div>
                  {versionSwitchEntries.length === 0 ? (
                    <div className="tm-pm-gantt-submenu-empty">
                      {t('projectManagerPage.schedule.versionSwitchEmpty')}
                    </div>
                  ) : (
                    versionSwitchEntries.map((entry) => {
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
                              : t('projectManagerPage.schedule.versionSwitchNoSnapshot')
                          }
                          onClick={() => {
                            if (!entry.baselineId) return
                            onRestoreBaseline(entry.baselineId)
                            setOpenMenu(null)
                          }}>
                          {t('projectManagerPage.schedule.switchToVersion', { name: entry.name })}
                          {entry.isCurrent
                            ? ` · ${t('projectManagerPage.projectInfo.saveHistoryCurrent')}`
                            : ''}
                          {!canSwitch
                            ? ` · ${t('projectManagerPage.schedule.versionSwitchNoSnapshotShort')}`
                            : ''}
                        </button>
                      )
                    })
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    className="tm-pm-gantt-view-option"
                    disabled={!selectedBaselineId}
                    onClick={() => {
                      onAction('editBaseline')
                      setOpenMenu(null)
                    }}>
                    {t('projectManagerPage.schedule.editBaseline')}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="tm-pm-gantt-view-option"
                    disabled={!selectedBaselineId}
                    onClick={() => {
                      onAction('deleteBaseline')
                    }}>
                    {t('projectManagerPage.schedule.deleteBaseline')}
                  </button>
                </>,
              )}

            {renderMenuButton(
              'node',
              nodeRef,
              t('projectManagerPage.schedule.menu.node'),
              { buttonDisabled: disabled || structureLocked },
            )}
            {openMenu === 'node' &&
              renderPanel(
                nodePos,
                <div className="tm-pm-gantt-submenu-empty">
                  {t('projectManagerPage.schedule.menu.nodePlaceholder')}
                </div>,
              )}

            {renderMenuButton(
              'resourceAssign',
              resourceAssignRef,
              t('projectManagerPage.schedule.menu.resource'),
              {
                active: scheduleView === 'resource',
                dividerAfter: false,
              },
            )}
            {openMenu === 'resourceAssign' &&
              renderPanel(
                resourceAssignPos,
                <>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={scheduleView === 'resource' && resourceTypeFilter === 'all'}
                    className={[
                      'tm-pm-gantt-view-option',
                      scheduleView === 'resource' && resourceTypeFilter === 'all'
                        ? 'tm-pm-gantt-view-option--active'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      onResourceTypeFilterChange?.('all')
                      setOpenMenu(null)
                    }}
                  >
                    {t('projectManagerPage.schedule.menu.assignAll')}
                  </button>
                  {GANTT_RESOURCE_ASSIGN_MENU_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="menuitemradio"
                      aria-checked={scheduleView === 'resource' && resourceTypeFilter === type}
                      className={[
                        'tm-pm-gantt-view-option',
                        scheduleView === 'resource' && resourceTypeFilter === type
                          ? 'tm-pm-gantt-view-option--active'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        onResourceTypeFilterChange?.(type)
                        setOpenMenu(null)
                      }}
                    >
                      {t(`projectManagerPage.resourceTable.types.${type}`)}
                    </button>
                  ))}
                </>,
              )}
            {renderMenuButton(
              'costAssign',
              costAssignRef,
              t('projectManagerPage.schedule.menu.cost'),
              {
                active: scheduleView === 'cost',
                dividerAfter: false,
              },
            )}
            {openMenu === 'costAssign' &&
              renderPanel(
                costAssignPos,
                <>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={scheduleView === 'cost' && costTypeFilter === 'all'}
                    className={[
                      'tm-pm-gantt-view-option',
                      scheduleView === 'cost' && costTypeFilter === 'all'
                        ? 'tm-pm-gantt-view-option--active'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      onCostTypeFilterChange?.('all')
                      setOpenMenu(null)
                    }}
                  >
                    {t('projectManagerPage.schedule.menu.assignAll')}
                  </button>
                  {GANTT_COST_ASSIGN_MENU_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="menuitemradio"
                      aria-checked={scheduleView === 'cost' && costTypeFilter === type}
                      className={[
                        'tm-pm-gantt-view-option',
                        scheduleView === 'cost' && costTypeFilter === type
                          ? 'tm-pm-gantt-view-option--active'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        onCostTypeFilterChange?.(type)
                        setOpenMenu(null)
                      }}
                    >
                      {t(`projectManagerPage.costTable.types.${type}`)}
                    </button>
                  ))}
                </>,
              )}
            {renderMenuButton(
              'smartAssign',
              smartAssignRef,
              t('projectManagerPage.schedule.menu.smartAssign'),
            )}
            {openMenu === 'smartAssign' &&
              renderPanel(
                smartAssignPos,
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="tm-pm-gantt-view-option"
                    onClick={() => {
                      onAction('autoAssignResource')
                      setOpenMenu(null)
                    }}
                  >
                    {t('projectManagerPage.schedule.menu.autoAssignResource')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="tm-pm-gantt-view-option"
                    onClick={() => {
                      onAction('autoAssignCost')
                      setOpenMenu(null)
                    }}
                  >
                    {t('projectManagerPage.schedule.menu.autoAssignCost')}
                  </button>
                </>,
              )}

            {renderMenuButton(
              'analysis',
              analysisRef,
              t('projectManagerPage.schedule.menu.analysis'),
            )}
            {openMenu === 'analysis' &&
              renderPanel(
                analysisPos,
                <button
                  type="button"
                  role="menuitem"
                  className="tm-pm-gantt-view-option"
                  onClick={() => {
                    onAction('openAnalysis')
                    setOpenMenu(null)
                  }}>
                  {t('projectManagerPage.schedule.menu.openAnalysis')}
                </button>,
              )}
          </div>
        </div>
        {scrollMetrics.overflowing ? (
          <div
            ref={trackRef}
            className="tm-pm-gantt-menubar-hscroll"
            onPointerDown={onTrackPointerDown}>
            <div
              className="tm-pm-gantt-menubar-hscroll-thumb"
              style={{
                width: `${scrollMetrics.thumbSize * 100}%`,
                left: `${scrollMetrics.thumbOffset * 100}%`,
              }}
            />
          </div>
        ) : null}
      </div>
      {tooltip
        ? createPortal(
            <div
              className="tm-pm-gantt-menubar-tooltip"
              role="tooltip"
              style={{ top: tooltip.top, left: tooltip.left }}
            >
              {tooltip.text}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
