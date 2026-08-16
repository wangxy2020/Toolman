import { createPortal } from 'react-dom'

import { useMenuBarHScroll, useMenuBarTooltip } from '../../pm-menubar-chrome'
import { ProjectResourceMenuBarTypePanel } from './ProjectResourceMenuBarTypePanel'
import { ProjectResourceMenuBarVersionPanel } from './ProjectResourceMenuBarVersionPanel'
import { ProjectResourceMenuBarViewPanel } from './ProjectResourceMenuBarViewPanel'
import {
  buildResourceMenuItems,
  renderResourceToolbarItem,
} from './pm-resource-menubar-items'
import { useProjectResourceMenuBar } from './useProjectResourceMenuBar'
import type { ProjectResourceMenuBarProps } from './ProjectResourceMenuBarTypes'

export type {
  ProjectResourceMenuBarProps,
  ResourceMenuAction,
  ResourceVersionSwitchEntry,
  ResourceViewFilter,
} from './ProjectResourceMenuBarTypes'

type Props = ProjectResourceMenuBarProps

export function ProjectResourceMenuBar({
  disabled = false,
  hasSelection,
  hasProject = false,
  canEdit = true,
  canUndo = false,
  canRedo = false,
  viewFilter,
  onViewFilterChange,
  customTypeNames,
  onRegisterCustomTypeName,
  onRequestDeleteCustomTypeName,
  selectedType,
  selectedCustomTypeName = '',
  onTypeChange,
  versionSwitchEntries,
  onRestoreVersion,
  onAction,
}: Props) {
  const menu = useProjectResourceMenuBar({
    viewFilter,
    onViewFilterChange,
    onRegisterCustomTypeName,
    selectedType,
    selectedCustomTypeName,
    onTypeChange,
  })
  const { tooltip, hideTip, tipProps } = useMenuBarTooltip()
  const { scrollRef, trackRef, scrollMetrics, syncScrollMetrics, onTrackPointerDown } =
    useMenuBarHScroll()

  const items = buildResourceMenuItems({
    t: menu.t,
    canEdit,
    hasProject,
    canUndo,
    canRedo,
    hasSelection,
  })
  const leadingItems = items.slice(0, 8)
  const hierarchyItems = items.slice(8, 10)
  const moveItems = items.slice(10)
  const toolbarOpts = { disabled, hideTip, onAction, tipProps }

  return (
    <div
      className={[
        'tm-pm-resource-menubar',
        scrollMetrics.overflowing ? 'tm-pm-resource-menubar--overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
      aria-label={menu.t('projectManagerPage.resourceTable.menu.barLabel')}
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
            <ProjectResourceMenuBarViewPanel
              viewRef={menu.viewRef}
              viewPos={menu.viewPos}
              customViewGroupRef={menu.customViewGroupRef}
              viewOpen={menu.viewOpen}
              viewMenuLabel={menu.viewMenuLabel}
              viewCurrentLabel={menu.viewCurrentLabel}
              viewFilter={viewFilter}
              customTypeNames={customTypeNames}
              customViewExpanded={menu.customViewExpanded}
              customViewSubPos={menu.customViewSubPos}
              customViewDraft={menu.customViewDraft}
              canEdit={canEdit}
              disabled={disabled}
              hideTip={hideTip}
              tipProps={tipProps}
              t={menu.t}
              setViewOpen={menu.setViewOpen}
              setTypeOpen={menu.setTypeOpen}
              setBaselineOpen={menu.setBaselineOpen}
              setCustomViewExpanded={menu.setCustomViewExpanded}
              setCustomViewSubPos={menu.setCustomViewSubPos}
              setCustomViewDraft={menu.setCustomViewDraft}
              onViewFilterChange={onViewFilterChange}
              onRequestDeleteCustomTypeName={onRequestDeleteCustomTypeName}
              hideCustomViewSubmenu={menu.hideCustomViewSubmenu}
              keepCustomViewSubmenu={menu.keepCustomViewSubmenu}
              scheduleHideCustomViewSubmenu={menu.scheduleHideCustomViewSubmenu}
              placeCustomSubmenu={menu.placeCustomSubmenu}
              commitCustomViewTypeName={menu.commitCustomViewTypeName}
            />

            {leadingItems.map((item) => renderResourceToolbarItem(item, toolbarOpts))}
            {hierarchyItems.map((item) => renderResourceToolbarItem(item, toolbarOpts))}

            <ProjectResourceMenuBarTypePanel
              typeRef={menu.typeRef}
              typePos={menu.typePos}
              customTypeGroupRef={menu.customTypeGroupRef}
              typeOpen={menu.typeOpen}
              typeMenuLabel={menu.typeMenuLabel}
              typeLabel={menu.typeLabel}
              selectedType={selectedType}
              selectedCustomTypeName={selectedCustomTypeName}
              customTypeNames={customTypeNames}
              customTypeSubPos={menu.customTypeSubPos}
              disabled={disabled}
              hasSelection={hasSelection}
              hideTip={hideTip}
              tipProps={tipProps}
              t={menu.t}
              setViewOpen={menu.setViewOpen}
              setBaselineOpen={menu.setBaselineOpen}
              setTypeOpen={menu.setTypeOpen}
              setCustomTypeSubPos={menu.setCustomTypeSubPos}
              onTypeChange={onTypeChange}
              placeCustomSubmenu={menu.placeCustomSubmenu}
              closeTypeMenus={menu.closeTypeMenus}
              applyCustomTypeToSelection={menu.applyCustomTypeToSelection}
            />

            {moveItems.map((item) => renderResourceToolbarItem(item, toolbarOpts))}

            <ProjectResourceMenuBarVersionPanel
              baselineRef={menu.baselineRef}
              baselinePos={menu.baselinePos}
              baselineOpen={menu.baselineOpen}
              baselineMenuLabel={menu.baselineMenuLabel}
              versionSwitchEntries={versionSwitchEntries}
              disabled={disabled}
              hasProject={hasProject}
              hideTip={hideTip}
              tipProps={tipProps}
              t={menu.t}
              setViewOpen={menu.setViewOpen}
              setTypeOpen={menu.setTypeOpen}
              setBaselineOpen={menu.setBaselineOpen}
              onRestoreVersion={onRestoreVersion}
            />
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
