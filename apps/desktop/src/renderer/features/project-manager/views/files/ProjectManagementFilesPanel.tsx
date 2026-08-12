import type { FC, Ref } from 'react'
import { useImperativeHandle } from 'react'

import { ProjectFeaturesMenuBar, type FeaturesMenuAction } from './ProjectFeaturesMenuBar'
import { ProjectManagementFilesPanelDialogs } from './ProjectManagementFilesPanelDialogs'
import { ProjectManagementFilesPanelMatrix } from './ProjectManagementFilesPanelMatrix'
import { ProjectManagementFilesPanelMenus } from './ProjectManagementFilesPanelMenus'
import { ProjectManagementFilesPanelScrollbar } from './ProjectManagementFilesPanelScrollbar'
import {
  useProjectManagementFilesPanel,
  type ProjectManagementFilesPanelProps as BaseProps,
} from './useProjectManagementFilesPanel'

export type { ProjectManagementFilesPanelState } from './useProjectManagementFilesPanel'

/** Imperative bridge so a parent menubar (e.g. 价格表 · 计量) can drive row edits. */
export type ProjectManagementFilesPanelHandle = {
  dispatchMenuAction: (action: FeaturesMenuAction) => void
  /** Persist dirty catalog before the parent unmounts this panel (leave 计量). */
  flushIfDirty: () => Promise<void>
}

type Props = BaseProps & {
  actionBridgeRef?: Ref<ProjectManagementFilesPanelHandle | null>
}

/**
 * Practice (实务) view — table chrome aligned with Resource list
 * (`tm-pm-resource-table-*` + Gantt page shell / Features menubar).
 *
 * Thin orchestrator: owns no rendering logic of its own — all state/handlers live in
 * `useProjectManagementFilesPanel`, all presentational JSX lives in the sibling
 * `ProjectManagementFilesPanel*` components (Matrix / Scrollbar / Menus / Dialogs).
 */
const ProjectManagementFilesPanel: FC<Props> = (props) => {
  const state = useProjectManagementFilesPanel(props)
  const {
    t,
    saving,
    canEdit,
    selectedId,
    selectedType,
    scheduleView,
    versionSwitchEntries,
    handleRestoreVersion,
    handleScheduleViewChange,
    handleMenuAction,
    flushAutoSave,
    dirty,
    statusFeedback,
    visibleRows,
    selectedRow,
    hScrollMetrics,
    hScrollDragging,
    showTrailingMenus,
    embedded,
  } = state

  useImperativeHandle(
    props.actionBridgeRef,
    () => ({
      dispatchMenuAction: handleMenuAction,
      flushIfDirty: async () => {
        if (!dirty) return
        await flushAutoSave()
      },
    }),
    [dirty, flushAutoSave, handleMenuAction],
  )
  /** Embedded metering under 价格表 uses the same scroll chrome as 全部类型. */
  const scrollWrapClass = embedded
    ? [
        'tm-pm-resource-table-scroll-wrap',
        'tm-pm-cost-metering-table',
        hScrollMetrics.overflowing ? 'tm-pm-resource-table-scroll-wrap--h-overflow' : '',
        hScrollDragging ? 'tm-pm-resource-table-scroll-wrap--h-dragging' : '',
      ]
    : [
            'tm-pm-features-table-scroll-wrap',
            hScrollMetrics.overflowing ? 'tm-pm-features-table-scroll-wrap--h-overflow' : '',
            hScrollDragging ? 'tm-pm-features-table-scroll-wrap--h-dragging' : '',
          ]

  const tableBody = !canEdit ? (
    <div className="tm-pm-empty">
      {t(
        embedded
          ? 'projectManagerPage.costTable.needProject'
          : 'projectManagerPage.files.table.needProject',
                )}
              </div>
  ) : (
    <div className={scrollWrapClass.filter(Boolean).join(' ')}>
      <ProjectManagementFilesPanelMatrix state={state} />
      <ProjectManagementFilesPanelScrollbar state={state} />
            </div>
  )

  const statusReadyKey = embedded
    ? 'projectManagerPage.costTable.statusReady'
    : 'projectManagerPage.files.table.statusReady'
  const statusDirtyKey = embedded
    ? 'projectManagerPage.costTable.statusDirty'
    : 'projectManagerPage.files.table.statusDirty'
  const statusSelectedKey = embedded
    ? 'projectManagerPage.costTable.statusSelected'
    : 'projectManagerPage.files.table.statusSelected'

  const statusFooter = (
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
            ? t(statusDirtyKey, { count: String(visibleRows.length) })
            : t(statusReadyKey, { count: String(visibleRows.length) })}
          {!statusFeedback && selectedRow?.name
          ? ` · ${t(statusSelectedKey, { name: selectedRow.name })}`
            : null}
        </div>
      </footer>
  )

  const overlays = (
    <>
      <ProjectManagementFilesPanelMenus state={state} />
      <ProjectManagementFilesPanelDialogs state={state} onProjectsChange={props.onProjectsChange} />
    </>
  )

  const menubar = (
    <ProjectFeaturesMenuBar
      disabled={saving}
      hasSelection={selectedId != null}
      hasProject
      canEdit={canEdit}
      selectedType={selectedType}
      scheduleView={scheduleView}
      onScheduleViewChange={handleScheduleViewChange}
      versionSwitchEntries={versionSwitchEntries}
      onRestoreVersion={handleRestoreVersion}
      onAction={handleMenuAction}
      showTrailingMenus={showTrailingMenus}
      showViewMenu={showTrailingMenus}
    />
  )

  if (embedded) {
    // Same page shell as 价格表 · 全部类型: scroll wrap + status under the cost menubar.
    return (
      <>
        {tableBody}
        {statusFooter}
        {overlays}
      </>
    )
  }

  return (
    <div
                  className={[
        'tm-pm-gantt-page',
        'tm-pm-features-page',
        'tm-pm-features-table-page',
        state.isNodeView ? 'tm-pm-features-table-page--node' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
    >
      {menubar}
      {tableBody}
      {statusFooter}
      {overlays}
              </div>
  )
}

export default ProjectManagementFilesPanel
