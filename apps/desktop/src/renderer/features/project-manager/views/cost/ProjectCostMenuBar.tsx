import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import { useMenuBarHScroll, useMenuBarTooltip } from '../../pm-menubar-chrome'
import { ProjectCostMenuBarSectionPanel } from './ProjectCostMenuBarSectionPanel'
import { ProjectCostMenuBarFetchPanel } from './ProjectCostMenuBarFetchPanel'
import { ProjectCostMenuBarMeteringPanel } from './ProjectCostMenuBarMeteringPanel'
import { ProjectCostMenuBarViewPanel } from './ProjectCostMenuBarViewPanel'
import { buildCostMenuBarItems } from './pm-cost-menubar-items'
import { useProjectCostMenuBar } from './useProjectCostMenuBar'
import type { ProjectCostMenuBarProps } from './project-cost-menu-bar-types'

export type {
  CostViewFilter,
  CostMenuAction,
  CostVersionSwitchEntry,
  CostViewMenuVariant,
  CostPracticeViewPage,
  ProjectCostMenuBarProps,
} from './project-cost-menu-bar-types'
export {
  COST_PRACTICE_VIEW_PAGES,
  isCostPracticeViewPage,
} from './project-cost-menu-bar-types'

type Props = ProjectCostMenuBarProps

export function ProjectCostMenuBar({
  disabled = false,
  hasSelection,
  hasProject = false,
  canEdit = true,
  canUndo = false,
  canRedo = false,
  showFetch = false,
  fetching = false,
  showMetering = true,
  viewMenuVariant = 'catalog',
  viewFilter,
  onViewFilterChange,
  sectionFilter: _sectionFilter,
  onSectionFilterChange: _onSectionFilterChange,
  databaseRowFilter,
  onDatabaseRowFilterChange,
  subprojectOptions,
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
    fetchOpen,
    setFetchOpen,
    meteringOpen,
    setMeteringOpen,
    viewRef,
    typeRef,
    fetchRef,
    meteringRef,
    viewPos,
    typePos,
    fetchPos,
    meteringPos,
    viewMenuLabel,
    viewCurrentLabel,
    sectionMenuLabel,
    sectionCurrentLabel,
    fetchMenuLabel,
    meteringMenuLabel,
  } = useProjectCostMenuBar({
    viewFilter,
    viewMenuVariant,
    databaseRowFilter,
    subprojectOptions,
    sectionalOptions,
  })
  const { tooltip, hideTip, tipProps } = useMenuBarTooltip()
  const { scrollRef, trackRef, scrollMetrics, syncScrollMetrics, onTrackPointerDown } =
    useMenuBarHScroll()

  const items = buildCostMenuBarItems(t, {
    hasSelection,
    hasProject,
    canEdit,
    canUndo,
    canRedo,
  })

  const insertIndex = items.findIndex((item) => item.key === 'insert')
  const indentIndex = items.findIndex((item) => item.key === 'indent')
  const leadingItems = items.slice(0, insertIndex)
  const hierarchyItems = items.slice(insertIndex, indentIndex)
  const moveItems = items.slice(indentIndex)

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
                  setFetchOpen(false)
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
                  viewMenuVariant={viewMenuVariant}
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
            {moveItems.map(renderToolbarItem)}

            {showFetch ? (
              <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={fetchRef}>
                <button
                  type="button"
                  className="tm-pm-resource-menubar-btn"
                  aria-label={fetchMenuLabel}
                  aria-disabled={disabled}
                  aria-expanded={fetchOpen}
                  onClick={() => {
                    if (disabled) return
                    hideTip()
                    setViewOpen(false)
                    setTypeOpen(false)
                    setMeteringOpen(false)
                    setFetchOpen((open) => !open)
                  }}
                  {...tipProps(fetchMenuLabel)}
                >
                  <span>{fetchMenuLabel}</span>
                  <IconChevronDown size={14} />
                </button>
                {fetchOpen ? (
                  <ProjectCostMenuBarFetchPanel
                    pos={fetchPos}
                    fetching={fetching}
                    onSelect={(target) => {
                      setFetchOpen(false)
                      if (target === 'priceList') onAction('fetch')
                      if (target === 'meteringTable') onAction('fetchMetering')
                    }}
                  />
                ) : null}
              </span>
            ) : null}

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
                  setFetchOpen(false)
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
                  databaseRowFilter={databaseRowFilter}
                  subprojectOptions={subprojectOptions}
                  sectionalOptions={sectionalOptions}
                  onChange={onDatabaseRowFilterChange}
                />
              ) : null}
            </span>

            {showMetering ? (
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
                  setFetchOpen(false)
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
            ) : null}
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
