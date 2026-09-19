import { createPortal } from 'react-dom'

import { ALL_DATABASE_ROW_FILTER } from '../cost/pm-cost-row-filter'
import { useMenuBarHScroll, useMenuBarTooltip } from '../../pm-menubar-chrome'
import { ProjectFeaturesMenuBarResourceStatsPanel } from './ProjectFeaturesMenuBarResourceStatsPanel'
import type { ProjectFeaturesMenuBarProps } from './ProjectFeaturesMenuBarTypes'
import { ProjectFeaturesMenuBarFilterPanel } from './ProjectFeaturesMenuBarFilterPanel'
import { ProjectFeaturesMenuBarVersionPanel } from './ProjectFeaturesMenuBarVersionPanel'
import { ProjectFeaturesMenuBarViewPanel } from './ProjectFeaturesMenuBarViewPanel'
import {
  buildFeaturesMenuItems,
  renderFeaturesToolbarItem,
} from './pm-features-menubar-items'
import { useProjectFeaturesMenuBar } from './useProjectFeaturesMenuBar'

export type {
  CostPracticeQuotaView,
  FeaturesDatabaseRowFilter,
  FeaturesMenuAction,
  FeaturesResourceStatFilter,
  FeaturesScheduleView,
  FeaturesVersionSwitchEntry,
  FeaturesViewFilter,
  ProjectFeaturesMenuBarProps,
  ResourcePracticeQuotaView,
} from './ProjectFeaturesMenuBarTypes'

export {
  COST_DATABASE_QUOTA_VIEWS,
  COST_PRACTICE_QUOTA_VIEWS,
  FEATURES_RESOURCE_STAT_FILTERS,
  isFeaturesResourceStatFilter,
  RESOURCE_PRACTICE_QUOTA_VIEWS,
} from './ProjectFeaturesMenuBarTypes'

type Props = ProjectFeaturesMenuBarProps

export function ProjectFeaturesMenuBar({
  disabled = false,
  hasSelection = false,
  hasProject = false,
  canUndo = false,
  canRedo = false,
  canEdit = true,
  selectedType,
  scheduleView = 'gantt',
  onScheduleViewChange,
  viewMenuMode = 'schedule',
  quotaView = 'labor',
  onQuotaViewChange,
  costQuotaView = 'constructionQuota',
  onCostQuotaViewChange,
  costQuotaViewSet = 'practice',
  databaseRowFilter = ALL_DATABASE_ROW_FILTER,
  onDatabaseRowFilterChange,
  databaseSubprojectOptions = [],
  databaseSectionalOptions = [],
  showFetch = false,
  fetching = false,
  versionSwitchEntries = [],
  onRestoreVersion,
  onAction,
  showTrailingMenus = true,
  showViewMenu = true,
}: Props) {
  const {
    t,
    viewOpen,
    setViewOpen,
    resourceStatsOpen,
    setResourceStatsOpen,
    baselineOpen,
    setBaselineOpen,
    viewRef,
    resourceStatsRef,
    baselineRef,
    viewPos,
    resourceStatsPos,
    baselinePos,
    viewLabelByMode,
    quotaLabelByMode,
    costQuotaLabelByMode,
    viewCurrentLabel,
    baselineMenuLabel,
    resourceStatsMenuLabel,
    resourceStatMode,
    resourceStatCurrent,
    viewLabel,
  } = useProjectFeaturesMenuBar({
    selectedType,
    scheduleView,
    viewMenuMode,
    quotaView,
    costQuotaView,
    costQuotaViewSet,
  })
  const { tooltip, hideTip, tipProps } = useMenuBarTooltip()
  const { scrollRef, trackRef, scrollMetrics, syncScrollMetrics, onTrackPointerDown } =
    useMenuBarHScroll()

  const items = buildFeaturesMenuItems({
    t,
    canEdit,
    hasProject,
    canUndo,
    canRedo,
    hasSelection,
    selectedType,
    showFetch,
    fetching,
  })
  const toolbarOpts = { disabled, hideTip, onAction, tipProps }

  const moveDownIndex = items.findIndex((item) => item.key === 'moveDown')
  const leadingItems = items.slice(0, moveDownIndex === -1 ? items.length : moveDownIndex + 1)
  const trailingTypeItems = showTrailingMenus
    ? items.slice(moveDownIndex === -1 ? items.length : moveDownIndex + 1)
    : []

  return (
    <div
      className={[
        'tm-pm-features-menubar',
        scrollMetrics.overflowing ? 'tm-pm-features-menubar--overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
      aria-label={t('projectManagerPage.files.menu.barLabel')}
    >
      <div className="tm-pm-features-menubar-main">
        <div
          ref={scrollRef}
          className="tm-pm-features-menubar-scroll"
          onScroll={() => {
            hideTip()
            syncScrollMetrics()
          }}
        >
          <div className="tm-pm-features-menubar-group">
            {showViewMenu ? (
              <ProjectFeaturesMenuBarViewPanel
                disabled={disabled}
                viewRef={viewRef}
                viewOpen={viewOpen}
                setViewOpen={setViewOpen}
                viewPos={viewPos}
                viewLabel={viewLabel}
                viewCurrentLabel={viewCurrentLabel}
                viewMenuMode={viewMenuMode}
                scheduleView={scheduleView}
                onScheduleViewChange={onScheduleViewChange}
                quotaView={quotaView}
                onQuotaViewChange={onQuotaViewChange}
                costQuotaView={costQuotaView}
                onCostQuotaViewChange={onCostQuotaViewChange}
                costQuotaViewSet={costQuotaViewSet}
                viewLabelByMode={viewLabelByMode}
                quotaLabelByMode={quotaLabelByMode}
                costQuotaLabelByMode={costQuotaLabelByMode}
                hideTip={hideTip}
                tipProps={tipProps}
                closeSiblingMenus={() => {
                  setResourceStatsOpen(false)
                  setBaselineOpen(false)
                }}
              />
            ) : null}

            {leadingItems.map((item) => renderFeaturesToolbarItem(item, toolbarOpts))}

            {costQuotaViewSet === 'database' ? (
              <ProjectFeaturesMenuBarFilterPanel
                t={t}
                disabled={disabled}
                hasProject={hasProject}
                baselineRef={baselineRef}
                baselineOpen={baselineOpen}
                setBaselineOpen={setBaselineOpen}
                baselinePos={baselinePos}
                filterMenuLabel={baselineMenuLabel}
                databaseRowFilter={databaseRowFilter}
                onDatabaseRowFilterChange={onDatabaseRowFilterChange}
                databaseSubprojectOptions={databaseSubprojectOptions}
                databaseSectionalOptions={databaseSectionalOptions}
                hideTip={hideTip}
                tipProps={tipProps}
                closeSiblingMenus={() => {
                  setViewOpen(false)
                  setResourceStatsOpen(false)
                }}
              />
            ) : (
              <ProjectFeaturesMenuBarVersionPanel
                t={t}
                disabled={disabled}
                hasProject={hasProject}
                baselineRef={baselineRef}
                baselineOpen={baselineOpen}
                setBaselineOpen={setBaselineOpen}
                baselinePos={baselinePos}
                baselineMenuLabel={baselineMenuLabel}
                versionSwitchEntries={versionSwitchEntries}
                onRestoreVersion={onRestoreVersion}
                hideTip={hideTip}
                tipProps={tipProps}
                closeSiblingMenus={() => {
                  setViewOpen(false)
                  setResourceStatsOpen(false)
                }}
              />
            )}

            {showTrailingMenus ? (
              <ProjectFeaturesMenuBarResourceStatsPanel
                t={t}
                disabled={disabled}
                resourceStatsRef={resourceStatsRef}
                resourceStatsOpen={resourceStatsOpen}
                setResourceStatsOpen={setResourceStatsOpen}
                resourceStatsPos={resourceStatsPos}
                resourceStatsMenuLabel={resourceStatsMenuLabel}
                resourceStatMode={resourceStatMode}
                resourceStatCurrent={resourceStatCurrent}
                onAction={onAction}
                hideTip={hideTip}
                tipProps={tipProps}
                closeSiblingMenus={() => {
                  setViewOpen(false)
                  setBaselineOpen(false)
                }}
              />
            ) : null}

            {trailingTypeItems.map((item) => renderFeaturesToolbarItem(item, toolbarOpts))}
          </div>
        </div>
        {scrollMetrics.overflowing ? (
          <div
            ref={trackRef}
            className="tm-pm-features-menubar-hscroll"
            onPointerDown={onTrackPointerDown}
          >
            <div
              className="tm-pm-features-menubar-hscroll-thumb"
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
              className="tm-pm-features-menubar-tooltip"
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
