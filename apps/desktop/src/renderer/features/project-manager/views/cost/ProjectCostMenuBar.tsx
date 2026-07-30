import type { MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import { useMenuBarHScroll, useMenuBarTooltip } from '../../pm-menubar-chrome'
import { ProjectCostMenuBarSectionPanel } from './ProjectCostMenuBarSectionPanel'
import { ProjectCostMenuBarMeteringPanel } from './ProjectCostMenuBarMeteringPanel'
import { ProjectCostMenuBarViewPanel } from './ProjectCostMenuBarViewPanel'
import { buildCostMenuBarItems } from './pm-cost-menubar-items'
import type { PmCostType } from './pm-cost-catalog'
import type { MeteringBaseline, MeteringRollupMode } from './pm-metering-baselines'
import { useProjectCostMenuBar } from './useProjectCostMenuBar'

export type CostViewFilter = 'all' | PmCostType

export type CostMenuAction =
  | 'save'
  | 'saveAsNewVersion'
  | 'import'
  | 'print'
  | 'projectInfo'
  | 'undo'
  | 'redo'
  | 'add'
  | 'insert'
  | 'delete'
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'
  | 'metering'
  | 'meteringCaptureBaseline'
  | 'meteringEditBaseline'
  | 'meteringDeleteBaseline'

export type CostVersionSwitchEntry = {
  version: number
  name: string
  hasSnapshot: boolean
  isCurrent: boolean
}

export interface ProjectCostMenuBarProps {
  disabled?: boolean
  hasSelection: boolean
  /** Enables 项目信息 — true for a concrete project or「全部项目」. */
  hasProject?: boolean
  canEdit?: boolean
  canUndo?: boolean
  canRedo?: boolean
  /** Table type filter; `all` shows every resource type. */
  viewFilter: CostViewFilter
  onViewFilterChange: (filter: CostViewFilter) => void
  /** 分部 filter for the type-slot menu; `all` = 全部分部. */
  sectionFilter: string
  onSectionFilterChange: (filter: string) => void
  /** Distinct 分部工程 names (trimmed; `''` = uncategorized), price-list order. */
  sectionalOptions: readonly string[]
  versionSwitchEntries: CostVersionSwitchEntry[]
  onRestoreVersion: (version: number) => void
  /** Highlights 计量 when the metering view is active (price-list view). */
  meteringActive?: boolean
  meteringBaselines?: readonly MeteringBaseline[]
  selectedMeteringBaselineId?: string | null
  onSelectMeteringBaseline?: (id: string) => void
  meteringRollupMode?: MeteringRollupMode
  onMeteringRollupModeChange?: (mode: MeteringRollupMode) => void
  onAction: (
    action: CostMenuAction,
    event?: Pick<ReactMouseEvent, 'metaKey' | 'ctrlKey'>,
  ) => void
}

type Props = ProjectCostMenuBarProps

export function ProjectCostMenuBar({
  disabled = false,
  hasSelection,
  hasProject = false,
  canEdit = true,
  canUndo = false,
  canRedo = false,
  viewFilter,
  onViewFilterChange,
  sectionFilter,
  onSectionFilterChange,
  sectionalOptions,
  versionSwitchEntries,
  onRestoreVersion,
  meteringActive = false,
  meteringBaselines = [],
  selectedMeteringBaselineId = null,
  onSelectMeteringBaseline,
  meteringRollupMode = 'none',
  onMeteringRollupModeChange,
  onAction,
}: Props) {
  const {
    t,
    viewOpen,
    setViewOpen,
    typeOpen,
    setTypeOpen,
    meteringOpen,
    setMeteringOpen,
    viewRef,
    typeRef,
    meteringRef,
    viewPos,
    typePos,
    meteringPos,
    viewMenuLabel,
    viewCurrentLabel,
    sectionMenuLabel,
    sectionOptionLabel,
    sectionCurrentLabel,
    meteringMenuLabel,
  } = useProjectCostMenuBar({ viewFilter, sectionFilter })
  const { tooltip, hideTip, tipProps } = useMenuBarTooltip()
  const { scrollRef, trackRef, scrollMetrics, syncScrollMetrics, onTrackPointerDown } =
    useMenuBarHScroll()

  const items = buildCostMenuBarItems(t, { hasSelection, hasProject, canEdit, canUndo, canRedo })

  const leadingItems = items.slice(0, 8)
  const hierarchyItems = items.slice(8, 10)
  const moveItems = items.slice(10)

  const renderToolbarItem = (item: (typeof items)[number]) => {
    const isDisabled = Boolean(disabled || item.disabled)
    return (
      <span key={item.key} className="tm-pm-resource-menubar-item">
        <button
          type="button"
          className={[
            'tm-pm-resource-menubar-btn',
            item.icon ? 'tm-pm-resource-menubar-btn--icon' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={item.title}
          aria-disabled={isDisabled}
          onClick={(event) => {
            if (isDisabled) return
            hideTip()
            onAction(item.key, {
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
            })
          }}
          {...tipProps(item.title)}
        >
          {item.label}
        </button>
        {item.dividerAfter ? <span className="tm-pm-resource-menubar-divider" /> : null}
      </span>
    )
  }

  return (
    <div
      className={[
        'tm-pm-resource-menubar',
        scrollMetrics.overflowing ? 'tm-pm-resource-menubar--overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
      aria-label={t('projectManagerPage.costTable.menu.barLabel')}
    >
      <div className="tm-pm-resource-menubar-main">
        <div
          ref={scrollRef}
          className="tm-pm-resource-menubar-scroll"
          onScroll={() => {
            hideTip()
            syncScrollMetrics()
          }}
        >
          <div className="tm-pm-resource-menubar-group">
            <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={viewRef}>
              <button
                type="button"
                className="tm-pm-resource-menubar-btn"
                aria-label={viewMenuLabel}
                aria-disabled={disabled}
                aria-expanded={viewOpen}
                onClick={() => {
                  if (disabled) return
                  hideTip()
                  setTypeOpen(false)
                  setMeteringOpen(false)
                  setViewOpen((open) => !open)
                }}
                {...tipProps(viewMenuLabel)}
              >
                <span>{viewMenuLabel}</span>
                <span className="tm-pm-gantt-view-current">{viewCurrentLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {viewOpen ? (
                <ProjectCostMenuBarViewPanel
                  pos={viewPos}
                  viewFilter={viewFilter}
                  onSelect={(filter) => {
                    onViewFilterChange(filter)
                    setViewOpen(false)
                  }}
                />
              ) : null}
              <span className="tm-pm-resource-menubar-divider" />
            </span>

            {leadingItems.map(renderToolbarItem)}
            {hierarchyItems.map(renderToolbarItem)}

            <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={typeRef}>
              <button
                type="button"
                className="tm-pm-resource-menubar-btn"
                aria-label={sectionMenuLabel}
                aria-disabled={disabled}
                aria-expanded={typeOpen}
                onClick={() => {
                  if (disabled) return
                  hideTip()
                  setViewOpen(false)
                  setMeteringOpen(false)
                  setTypeOpen((open) => !open)
                }}
                {...tipProps(sectionMenuLabel)}
              >
                <span>{sectionMenuLabel}</span>
                <span className="tm-pm-gantt-view-current">{sectionCurrentLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {typeOpen ? (
                <ProjectCostMenuBarSectionPanel
                  pos={typePos}
                  sectionFilter={sectionFilter}
                  sectionalOptions={sectionalOptions}
                  sectionOptionLabel={sectionOptionLabel}
                  onSelect={(filter) => {
                    onSectionFilterChange(filter)
                    setTypeOpen(false)
                  }}
                />
              ) : null}
              <span className="tm-pm-resource-menubar-divider" />
            </span>

            {moveItems.map(renderToolbarItem)}

            <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={meteringRef}>
              <button
                type="button"
                className={[
                  'tm-pm-resource-menubar-btn',
                  meteringActive ? 'tm-pm-resource-menubar-btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={meteringMenuLabel}
                aria-disabled={disabled || !hasProject}
                aria-expanded={meteringOpen}
                aria-pressed={meteringActive}
                onClick={() => {
                  if (disabled || !hasProject) return
                  hideTip()
                  setViewOpen(false)
                  setTypeOpen(false)
                  // Enter metering view (price-list feature); toggle the dropdown.
                  onAction('metering')
                  setMeteringOpen((open) => !open)
                }}
                {...tipProps(meteringMenuLabel)}
              >
                <span>{meteringMenuLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {meteringOpen ? (
                <ProjectCostMenuBarMeteringPanel
                  pos={meteringPos}
                  versionSwitchEntries={versionSwitchEntries}
                  onRestoreVersion={onRestoreVersion}
                  meteringBaselines={meteringBaselines}
                  selectedMeteringBaselineId={selectedMeteringBaselineId}
                  onSelectMeteringBaseline={(id) => onSelectMeteringBaseline?.(id)}
                  meteringRollupMode={meteringRollupMode}
                  onMeteringRollupModeChange={(mode) => onMeteringRollupModeChange?.(mode)}
                  onAction={(action) => onAction(action)}
                  onClose={() => setMeteringOpen(false)}
                />
              ) : null}
            </span>
          </div>
        </div>
        {scrollMetrics.overflowing ? (
          <div
            ref={trackRef}
            className="tm-pm-resource-menubar-hscroll"
            onPointerDown={onTrackPointerDown}
          >
            <div
              className="tm-pm-resource-menubar-hscroll-thumb"
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
              className="tm-pm-resource-menubar-tooltip"
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
