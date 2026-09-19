import type { FC } from 'react'
import { useCallback } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { ProjectCostMenuBar, type CostMenuAction } from './ProjectCostMenuBar'
import { ProjectCostTableBody } from './ProjectCostTableBody'
import { ProjectCostTableDialogs } from './ProjectCostTableDialogs'
import { ProjectCostTableHeader } from './ProjectCostTableHeader'
import { ProjectCostTableMenus } from './ProjectCostTableMenus'
import {
  useProjectCostTablePanel,
  type ProjectCostTablePanelProps,
} from './useProjectCostTablePanel'

export type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

type Props = ProjectCostTablePanelProps

/**
 * Thin orchestrator: owns no rendering logic of its own — all state/handlers live in
 * `useProjectCostTablePanel`, all presentational JSX lives in the sibling `ProjectCostTable*`
 * components (Header / Body / Menus / Dialogs).
 */
const ProjectCostTablePanel: FC<Props> = (props) => {
  const { t } = useI18n()
  const state = useProjectCostTablePanel(props)
  const {
    panelRootRef,
    tableScrollRef,
    hTrackRef,
    canEdit,
    sectionalOptions,
    selectedId,
    hScrollMetrics,
    hScrollDragging,
    viewFilter,
    handleViewFilterChange,
    sectionFilter,
    handleSectionFilterChange,
    canUndo,
    canRedo,
    saving,
    statusFeedback,
    versionSwitchEntries,
    handleRestoreVersion,
    handleMenuAction,
    meteringBaselines,
    selectedMeteringBaselineId,
    setSelectedMeteringBaselineId,
    meteringRollupMode,
    handleMeteringRollupModeChange,
    dirty,
    rows,
    selectedRow,
    onHTrackPointerDown,
    showMeteringColumns,
  } = state

  const viewMenuVariant = props.variant ?? 'catalog'
  const showReservedView =
    viewFilter === 'progressPaymentSummary' || viewFilter === 'paymentSummary'

  const onViewFilterChange = useCallback(
    (filter: Parameters<typeof handleViewFilterChange>[0]) => {
      handleViewFilterChange(filter)
    },
    [handleViewFilterChange],
  )

  const onSectionFilterChange = useCallback(
    (filter: Parameters<typeof handleSectionFilterChange>[0]) => {
      handleSectionFilterChange(filter)
    },
    [handleSectionFilterChange],
  )

  const onDatabaseRowFilterChange = useCallback(
    (filter: Parameters<typeof state.setDatabaseRowFilter>[0]) => {
      state.setDatabaseRowFilter(filter)
      handleSectionFilterChange('all')
    },
    [handleSectionFilterChange, state.setDatabaseRowFilter],
  )

  const handleCostMenuAction = useCallback(
    (
      action: CostMenuAction,
      event?: { metaKey?: boolean; ctrlKey?: boolean },
    ) => {
      handleMenuAction(action, event)
    },
    [handleMenuAction],
  )

  return (
    <div
      ref={panelRootRef}
      className={[
        'tm-pm-gantt-page',
        'tm-pm-resource-table-page',
        'tm-pm-cost-table-page',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ProjectCostMenuBar
        disabled={saving || state.fetching}
        showFetch
        fetching={state.fetching}
        hasSelection={selectedId != null}
        hasProject
        canEdit={canEdit}
        canUndo={canUndo}
        canRedo={canRedo}
        showMetering={viewMenuVariant !== 'catalog'}
        viewMenuVariant={viewMenuVariant}
        viewFilter={viewFilter}
        onViewFilterChange={onViewFilterChange}
        sectionFilter={sectionFilter}
        onSectionFilterChange={onSectionFilterChange}
        databaseRowFilter={state.databaseRowFilter}
        onDatabaseRowFilterChange={onDatabaseRowFilterChange}
        subprojectOptions={state.subprojectOptions}
        sectionalOptions={sectionalOptions}
        versionSwitchEntries={versionSwitchEntries}
        onRestoreVersion={handleRestoreVersion}
        meteringActive={showMeteringColumns}
        meteringBaselines={meteringBaselines}
        selectedMeteringBaselineId={selectedMeteringBaselineId}
        onSelectMeteringBaseline={setSelectedMeteringBaselineId}
        meteringRollupMode={meteringRollupMode}
        onMeteringRollupModeChange={handleMeteringRollupModeChange}
        onAction={handleCostMenuAction}
      />

      {showReservedView ? (
        <div className="tm-pm-empty">
          {t('projectManagerPage.costTable.views.pageReserved')}
        </div>
      ) : !canEdit ? (
        <div className="tm-pm-empty">{t('projectManagerPage.costTable.needProject')}</div>
      ) : (
        <div
          className={[
            'tm-pm-resource-table-scroll-wrap',
            hScrollMetrics.overflowing ? 'tm-pm-resource-table-scroll-wrap--h-overflow' : '',
            hScrollDragging ? 'tm-pm-resource-table-scroll-wrap--h-dragging' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <ProjectCostTableHeader state={state} />
          <ProjectCostTableBody state={state} />
          {hScrollMetrics.overflowing ? (
            <div
              ref={hTrackRef}
              className="tm-pm-gantt-grid-custom-hscroll"
              onPointerDown={onHTrackPointerDown}
              role="scrollbar"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                (hScrollMetrics.thumbOffset /
                  Math.max(
                    1,
                    (tableScrollRef.current?.clientWidth ?? 1) - hScrollMetrics.thumbSize,
                  )) *
                  100,
              )}
            >
              <div
                className="tm-pm-gantt-grid-custom-hscroll-thumb"
                style={{
                  width: `${hScrollMetrics.thumbSize}px`,
                  left: `${hScrollMetrics.thumbOffset}px`,
                }}
              />
            </div>
          ) : null}
        </div>
      )}

      {showReservedView ? null : (
      <footer className="tm-pm-gantt-statusbar" aria-live="polite">
        <div
          className={[
            'tm-pm-gantt-statusbar-message',
            statusFeedback
              ? `tm-pm-gantt-statusbar-message--${statusFeedback.tone}`
              : dirty
                ? 'tm-pm-gantt-statusbar-message--info'
                : 'tm-pm-gantt-statusbar-message--muted',
          ].join(' ')}
        >
          {statusFeedback
            ? statusFeedback.text
            : dirty
              ? t('projectManagerPage.costTable.statusDirty', {
                  count: String(rows.length),
                })
              : t('projectManagerPage.costTable.statusReady', {
                  count: String(rows.length),
                })}
          {!statusFeedback && selectedRow?.name
            ? ` · ${t('projectManagerPage.costTable.statusSelected', {
                name: selectedRow.name,
              })}`
            : null}
        </div>
      </footer>
      )}

      {showReservedView ? null : <ProjectCostTableMenus state={state} />}
      <ProjectCostTableDialogs panelProps={props} state={state} />
              </div>
  )
}

export default ProjectCostTablePanel
