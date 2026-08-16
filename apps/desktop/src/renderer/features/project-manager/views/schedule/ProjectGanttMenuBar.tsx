import { createPortal } from 'react-dom'

import { useMenuBarHScroll, useMenuBarTooltip } from '../../pm-menubar-chrome'
import {
  ProjectGanttMenuBarAnalysisPanel,
  ProjectGanttMenuBarCostAssignPanel,
  ProjectGanttMenuBarNodePanel,
  ProjectGanttMenuBarResourceAssignPanel,
  ProjectGanttMenuBarSmartAssignPanel,
} from './ProjectGanttMenuBarAssignPanels'
import { ProjectGanttMenuBarBaselinePanel } from './ProjectGanttMenuBarBaselinePanel'
import {
  ProjectGanttMenuBarTypeMenu,
  ProjectGanttMenuBarViewOptions,
} from './ProjectGanttMenuBarViewPanel'
import {
  buildGanttMenuItems,
  renderGanttMenuButton,
  renderGanttToolbarItem,
} from './pm-gantt-menubar-items'
import { useProjectGanttMenuBar } from './useProjectGanttMenuBar'
import type { ProjectGanttMenuBarProps } from './ProjectGanttMenuBarTypes'

export type {
  GanttLeafTaskType,
  GanttMenuAction,
  GanttVersionSwitchEntry,
  ProjectGanttMenuBarProps,
} from './ProjectGanttMenuBarTypes'

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

  const items = buildGanttMenuItems({
    t,
    hasProject,
    canUndo,
    canRedo,
    hasSelection,
    structureLocked,
  })
  const leadingItems = items.slice(0, 9)
  const hierarchyItems = items.slice(9, 11)
  const moveItems = items.slice(11)
  const menuButtonOpts = { openMenu, hideTip, toggleMenu, tipProps }

  return (
    <div
      className={[
        'tm-pm-gantt-menubar',
        scrollMetrics.overflowing ? 'tm-pm-gantt-menubar--overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
      aria-label={t('projectManagerPage.schedule.menu.barLabel')}
    >
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
            {renderGanttMenuButton(
              'view',
              viewRef,
              t('projectManagerPage.schedule.menu.view'),
              { ...menuButtonOpts, current: viewLabelByMode[scheduleView] },
            )}
            {openMenu === 'view' && (
              <ProjectGanttMenuBarViewOptions
                viewPos={viewPos}
                scheduleView={scheduleView}
                viewLabelByMode={viewLabelByMode}
                onScheduleViewChange={onScheduleViewChange}
                setOpenMenu={setOpenMenu}
              />
            )}

            {leadingItems.map((item) =>
              renderGanttToolbarItem(item, { disabled, hideTip, onAction, tipProps }),
            )}
            {hierarchyItems.map((item) =>
              renderGanttToolbarItem(item, { disabled, hideTip, onAction, tipProps }),
            )}

            <ProjectGanttMenuBarTypeMenu
              typeRef={typeRef}
              typePos={typePos}
              openMenu={openMenu}
              typeLabel={typeLabel}
              selectedTaskType={selectedTaskType}
              disabled={disabled}
              structureLocked={structureLocked}
              canSetTaskType={canSetTaskType}
              hideTip={hideTip}
              toggleMenu={toggleMenu}
              tipProps={tipProps}
              t={t}
              onAction={onAction}
              setOpenMenu={setOpenMenu}
            />

            {moveItems.map((item) =>
              renderGanttToolbarItem(item, { disabled, hideTip, onAction, tipProps }),
            )}

            {renderGanttMenuButton(
              'baseline',
              baselineRef,
              t('projectManagerPage.schedule.menu.baseline'),
              { ...menuButtonOpts, buttonDisabled: disabled || structureLocked, dividerAfter: false },
            )}
            {openMenu === 'baseline' && (
              <ProjectGanttMenuBarBaselinePanel
                baselinePos={baselinePos}
                hasProject={hasProject}
                baselines={baselines}
                selectedBaselineId={selectedBaselineId}
                onSelectBaseline={onSelectBaseline}
                baselineCompareMode={baselineCompareMode}
                onBaselineCompareModeChange={onBaselineCompareModeChange}
                versionSwitchEntries={versionSwitchEntries}
                onRestoreBaseline={onRestoreBaseline}
                onAction={onAction}
                setOpenMenu={setOpenMenu}
                t={t}
              />
            )}

            {renderGanttMenuButton(
              'node',
              nodeRef,
              t('projectManagerPage.schedule.menu.node'),
              { ...menuButtonOpts, buttonDisabled: disabled || structureLocked },
            )}
            {openMenu === 'node' && (
              <ProjectGanttMenuBarNodePanel nodePos={nodePos} t={t} />
            )}

            {renderGanttMenuButton(
              'resourceAssign',
              resourceAssignRef,
              t('projectManagerPage.schedule.menu.resource'),
              { ...menuButtonOpts, active: scheduleView === 'resource', dividerAfter: false },
            )}
            {openMenu === 'resourceAssign' && (
              <ProjectGanttMenuBarResourceAssignPanel
                resourceAssignPos={resourceAssignPos}
                scheduleView={scheduleView}
                resourceTypeFilter={resourceTypeFilter}
                onResourceTypeFilterChange={onResourceTypeFilterChange}
                setOpenMenu={setOpenMenu}
                t={t}
              />
            )}
            {renderGanttMenuButton(
              'costAssign',
              costAssignRef,
              t('projectManagerPage.schedule.menu.cost'),
              { ...menuButtonOpts, active: scheduleView === 'cost', dividerAfter: false },
            )}
            {openMenu === 'costAssign' && (
              <ProjectGanttMenuBarCostAssignPanel
                costAssignPos={costAssignPos}
                scheduleView={scheduleView}
                costTypeFilter={costTypeFilter}
                onCostTypeFilterChange={onCostTypeFilterChange}
                setOpenMenu={setOpenMenu}
                t={t}
              />
            )}
            {renderGanttMenuButton(
              'smartAssign',
              smartAssignRef,
              t('projectManagerPage.schedule.menu.smartAssign'),
              menuButtonOpts,
            )}
            {openMenu === 'smartAssign' && (
              <ProjectGanttMenuBarSmartAssignPanel
                smartAssignPos={smartAssignPos}
                onAction={onAction}
                setOpenMenu={setOpenMenu}
                t={t}
              />
            )}

            {renderGanttMenuButton(
              'analysis',
              analysisRef,
              t('projectManagerPage.schedule.menu.analysis'),
              menuButtonOpts,
            )}
            {openMenu === 'analysis' && (
              <ProjectGanttMenuBarAnalysisPanel
                analysisPos={analysisPos}
                onAction={onAction}
                setOpenMenu={setOpenMenu}
                t={t}
              />
            )}
          </div>
        </div>
        {scrollMetrics.overflowing ? (
          <div
            ref={trackRef}
            className="tm-pm-gantt-menubar-hscroll"
            onPointerDown={onTrackPointerDown}
          >
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
