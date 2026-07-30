import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconIndent,
  IconInsertRow,
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
import {
  PM_COST_PRACTICE_QUOTA_TYPES,
  type PmCostPracticeQuotaType,
} from '../cost/pm-cost-catalog'
import type { PmFeatureViewFilter } from './pm-features-catalog'
import { useProjectFeaturesMenuBar } from './useProjectFeaturesMenuBar'

const ICON_SIZE = 16

export type FeaturesMenuAction =
  | 'save'
  | 'saveAsNewVersion'
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
  | 'labor'
  | 'auxiliary'
  | 'material'
  | 'machinery'
  | 'device'
  | 'instrument'
  | 'scheduleAll'
  | 'procurement'
  | 'metering'
  | 'node'
  | 'funds'

export type FeaturesScheduleView = 'list' | 'gantt' | 'progressCheck' | 'resource' | 'cost'

/** 资源管理-实务「视图」下拉：人工 / 材料 / 机械定额。 */
export type ResourcePracticeQuotaView = 'labor' | 'material' | 'equipment'

export const RESOURCE_PRACTICE_QUOTA_VIEWS = [
  'labor',
  'material',
  'equipment',
] as const satisfies readonly ResourcePracticeQuotaView[]

/** 成本管理-实务「视图」下拉。 */
export type CostPracticeQuotaView = PmCostPracticeQuotaType

export const COST_PRACTICE_QUOTA_VIEWS = PM_COST_PRACTICE_QUOTA_TYPES

export type FeaturesVersionSwitchEntry = {
  version: number
  name: string
  hasSnapshot: boolean
  isCurrent: boolean
}

type MenuItem = {
  key: FeaturesMenuAction
  title: string
  label: ReactNode
  disabled?: boolean
  dividerAfter?: boolean
  icon?: boolean
  active?: boolean
}

/** Align with practice catalog filters (includes cost primary types like `other`). */
export type FeaturesViewFilter = PmFeatureViewFilter

/** Resource-stat filters shown in the「资源统计」dropdown (default: scheduleAll). */
export const FEATURES_RESOURCE_STAT_FILTERS = [
  'scheduleAll',
  'labor',
  'auxiliary',
  'material',
  'machinery',
  'device',
  'instrument',
] as const satisfies readonly FeaturesViewFilter[]

export type FeaturesResourceStatFilter = (typeof FEATURES_RESOURCE_STAT_FILTERS)[number]

export function isFeaturesResourceStatFilter(
  value: string | null | undefined,
): value is FeaturesResourceStatFilter {
  return (
    value != null &&
    (FEATURES_RESOURCE_STAT_FILTERS as readonly string[]).includes(value)
  )
}

export interface ProjectFeaturesMenuBarProps {
  disabled?: boolean
  hasSelection?: boolean
  hasProject?: boolean
  canUndo?: boolean
  canRedo?: boolean
  canEdit?: boolean
  /** Highlights the matching type /「全部」button. */
  selectedType?: FeaturesViewFilter
  scheduleView?: FeaturesScheduleView
  onScheduleViewChange?: (view: FeaturesScheduleView) => void
  /**
   * `schedule` = 计划实务；`resourceQuota` = 资源实务；`costQuota` = 成本实务。
   */
  viewMenuMode?: 'schedule' | 'resourceQuota' | 'costQuota'
  quotaView?: ResourcePracticeQuotaView
  onQuotaViewChange?: (view: ResourcePracticeQuotaView) => void
  costQuotaView?: CostPracticeQuotaView
  onCostQuotaViewChange?: (view: CostPracticeQuotaView) => void
  versionSwitchEntries?: FeaturesVersionSwitchEntry[]
  onRestoreVersion?: (version: number) => void
  onAction: (action: FeaturesMenuAction) => void
  /**
   * When false, hide menus after「基线」(资源统计 / 采购 / 节点 / 资金).
   * Used by 资源管理-实务 / 成本管理-实务 / 成本-价格表·计量.
   */
  showTrailingMenus?: boolean
  /** When false, hide the leading「视图」dropdown (used by locked metering view). */
  showViewMenu?: boolean
}

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
  } = useProjectFeaturesMenuBar({ selectedType, scheduleView, viewMenuMode, quotaView, costQuotaView })
  const { tooltip, hideTip, tipProps } = useMenuBarTooltip()
  const { scrollRef, trackRef, scrollMetrics, syncScrollMetrics, onTrackPointerDown } =
    useMenuBarHScroll()

  const items: MenuItem[] = [
    {
      key: 'save',
      title: t('projectManagerPage.files.menu.save'),
      label: <IconSave size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'saveAsNewVersion',
      title: t('projectManagerPage.files.menu.saveAsNewVersion'),
      label: <IconSaveAsNewVersion size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'print',
      title: t('projectManagerPage.files.menu.print'),
      label: <IconPrint size={ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'projectInfo',
      title: t('projectManagerPage.files.menu.projectInfo'),
      label: <IconProjectInfo size={ICON_SIZE} />,
      icon: true,
      disabled: !hasProject,
    },
    {
      key: 'undo',
      title: t('projectManagerPage.files.menu.undo'),
      label: <IconUndo size={ICON_SIZE} />,
      icon: true,
      disabled: !canUndo,
    },
    {
      key: 'redo',
      title: t('projectManagerPage.files.menu.redo'),
      label: <IconRedo size={ICON_SIZE} />,
      icon: true,
      disabled: !canRedo,
      dividerAfter: true,
    },
    {
      key: 'add',
      title: t('projectManagerPage.files.menu.add'),
      label: <IconPlus size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'insert',
      title: t('projectManagerPage.files.menu.insert'),
      label: <IconInsertRow size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit || !hasSelection,
    },
    {
      key: 'delete',
      title: t('projectManagerPage.files.menu.delete'),
      label: <IconTrash size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.files.menu.indent'),
      label: <IconIndent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.files.menu.outdent'),
      label: <IconOutdent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'moveUp',
      title: t('projectManagerPage.files.menu.moveUp'),
      label: <IconChevronUp size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'moveDown',
      title: t('projectManagerPage.files.menu.moveDown'),
      label: <IconChevronDown size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'procurement',
      title: t('projectManagerPage.files.menu.procurement'),
      label: t('projectManagerPage.files.menu.procurement'),
      active: selectedType === 'procurement',
    },
    {
      key: 'node',
      title: t('projectManagerPage.files.menu.node'),
      label: t('projectManagerPage.files.menu.node'),
      active: selectedType === 'node',
    },
    {
      key: 'funds',
      title: t('projectManagerPage.files.menu.funds'),
      label: t('projectManagerPage.files.menu.funds'),
      active: selectedType === 'funds',
    },
  ]

  const renderToolbarItem = (item: MenuItem) => {
    const isDisabled = Boolean(disabled || item.disabled)
    return (
      <span key={item.key} className="tm-pm-features-menubar-item">
        <button
          type="button"
          className={[
            'tm-pm-features-menubar-btn',
            item.icon ? 'tm-pm-features-menubar-btn--icon' : '',
            item.active ? 'tm-pm-features-menubar-btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={item.title}
          aria-disabled={isDisabled}
          aria-pressed={item.active ? true : undefined}
          onClick={() => {
            if (isDisabled) return
            hideTip()
            onAction(item.key)
          }}
          {...tipProps(item.title)}
        >
          {item.label}
        </button>
        {item.dividerAfter ? <span className="tm-pm-features-menubar-divider" /> : null}
      </span>
    )
  }

  // Edit actions through moveDown; trailing type filters after resource-stats dropdown.
  const leadingItems = items.slice(0, 13)
  const trailingTypeItems = showTrailingMenus ? items.slice(13) : []

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
            <span className="tm-pm-features-menubar-item tm-pm-gantt-view-menu" ref={viewRef}>
              <button
                type="button"
                className="tm-pm-features-menubar-btn"
                aria-label={viewLabel}
                aria-disabled={disabled}
                aria-expanded={viewOpen}
                onClick={() => {
                  if (disabled) return
                  hideTip()
                  setResourceStatsOpen(false)
                  setBaselineOpen(false)
                  setViewOpen((open) => !open)
                }}
                {...tipProps(viewLabel)}
              >
                <span>{viewLabel}</span>
                <span className="tm-pm-gantt-view-current">{viewCurrentLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {viewOpen && viewPos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel"
                      role="menu"
                      style={{ top: viewPos.top, left: viewPos.left }}
                    >
                      {viewMenuMode === 'resourceQuota'
                        ? RESOURCE_PRACTICE_QUOTA_VIEWS.map((view) => (
                            <button
                              key={view}
                              type="button"
                              role="menuitemradio"
                              aria-checked={quotaView === view}
                              className={[
                                'tm-pm-gantt-view-option',
                                quotaView === view ? 'tm-pm-gantt-view-option--active' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => {
                                onQuotaViewChange?.(view)
                                setViewOpen(false)
                              }}
                            >
                              {quotaLabelByMode[view]}
                            </button>
                          ))
                        : viewMenuMode === 'costQuota'
                          ? COST_PRACTICE_QUOTA_VIEWS.map((view) => (
                              <button
                                key={view}
                                type="button"
                                role="menuitemradio"
                                aria-checked={costQuotaView === view}
                                className={[
                                  'tm-pm-gantt-view-option',
                                  costQuotaView === view
                                    ? 'tm-pm-gantt-view-option--active'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onClick={() => {
                                  onCostQuotaViewChange?.(view)
                                  setViewOpen(false)
                                }}
                              >
                                {costQuotaLabelByMode[view]}
                              </button>
                            ))
                        : (['list', 'gantt', 'progressCheck', 'resource', 'cost'] as const).map(
                            (view) => (
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
                                  onScheduleViewChange?.(view)
                                  setViewOpen(false)
                                }}
                              >
                                {viewLabelByMode[view]}
                              </button>
                            ),
                          )}
                    </div>,
                    document.body,
                  )
                : null}
              <span className="tm-pm-features-menubar-divider" />
            </span>
            ) : null}

            {leadingItems.map(renderToolbarItem)}

            <span className="tm-pm-features-menubar-item tm-pm-gantt-view-menu" ref={baselineRef}>
              <button
                type="button"
                className="tm-pm-features-menubar-btn"
                aria-label={baselineMenuLabel}
                aria-disabled={disabled || !hasProject}
                aria-expanded={baselineOpen}
                onClick={() => {
                  if (disabled || !hasProject) return
                  hideTip()
                  setViewOpen(false)
                  setResourceStatsOpen(false)
                  setBaselineOpen((open) => !open)
                }}
                {...tipProps(baselineMenuLabel)}
              >
                <span>{baselineMenuLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {baselineOpen && baselinePos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel"
                      role="menu"
                      style={{ top: baselinePos.top, left: baselinePos.left }}
                    >
                      <div className="tm-pm-gantt-submenu-title">
                        {t('projectManagerPage.files.versionSwitch')}
                      </div>
                      {versionSwitchEntries.length === 0 ? (
                        <div className="tm-pm-gantt-submenu-empty">
                          {t('projectManagerPage.files.versionSwitchEmpty')}
                        </div>
                      ) : (
                        versionSwitchEntries.map((entry) => {
                          const canSwitch = entry.hasSnapshot && !entry.isCurrent
                          return (
                            <button
                              key={`restore-feature-v-${entry.version}`}
                              type="button"
                              role="menuitem"
                              className={[
                                'tm-pm-gantt-view-option',
                                entry.isCurrent ? 'tm-pm-gantt-view-option--active' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              disabled={!entry.hasSnapshot || entry.isCurrent}
                              title={
                                entry.hasSnapshot
                                  ? undefined
                                  : t('projectManagerPage.files.versionSwitchNoSnapshot')
                              }
                              onClick={() => {
                                if (!canSwitch) return
                                onRestoreVersion?.(entry.version)
                                setBaselineOpen(false)
                              }}
                            >
                              {t('projectManagerPage.files.switchToVersion', {
                                name: entry.name,
                              })}
                              {entry.isCurrent
                                ? ` · ${t('projectManagerPage.projectInfo.saveHistoryCurrent')}`
                                : ''}
                              {!entry.hasSnapshot
                                ? ` · ${t('projectManagerPage.files.versionSwitchNoSnapshotShort')}`
                                : ''}
                            </button>
                          )
                        })
                      )}
                    </div>,
                    document.body,
                  )
                : null}
              <span className="tm-pm-features-menubar-divider" />
            </span>

            {showTrailingMenus ? (
            <span
              className="tm-pm-features-menubar-item tm-pm-gantt-view-menu tm-pm-features-resource-stats-menu"
              ref={resourceStatsRef}
            >
              <button
                type="button"
                className={[
                  'tm-pm-features-menubar-btn',
                  resourceStatMode ? 'tm-pm-features-menubar-btn--active' : '',
                  resourceStatsOpen ? 'tm-pm-features-menubar-btn--open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={resourceStatsMenuLabel}
                aria-disabled={disabled}
                aria-expanded={resourceStatsOpen}
                aria-haspopup="menu"
                onClick={() => {
                  if (disabled) return
                  hideTip()
                  setViewOpen(false)
                  setBaselineOpen(false)
                  setResourceStatsOpen((open) => !open)
                }}
                {...tipProps(resourceStatsMenuLabel)}
              >
                <span>{resourceStatsMenuLabel}</span>
                <IconChevronDown
                  size={14}
                  className={[
                    'tm-pm-features-resource-stats-chevron',
                    resourceStatsOpen ? 'tm-pm-features-resource-stats-chevron--open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              </button>
              {resourceStatsOpen && resourceStatsPos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel tm-pm-features-resource-stats-panel"
                      role="menu"
                      aria-label={resourceStatsMenuLabel}
                      style={{ top: resourceStatsPos.top, left: resourceStatsPos.left }}
                    >
                      {FEATURES_RESOURCE_STAT_FILTERS.map((filter) => {
                        const checked = resourceStatCurrent === filter
                        const label =
                          filter === 'scheduleAll'
                            ? t('projectManagerPage.files.menu.scheduleAll')
                            : t(`projectManagerPage.files.menu.${filter}`)
                        return (
                          <button
                            key={filter}
                            type="button"
                            role="menuitemradio"
                            aria-checked={checked}
                            className={[
                              'tm-pm-gantt-view-option',
                              'tm-pm-gantt-view-option--checkable',
                              checked ? 'tm-pm-gantt-view-option--active' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => {
                              onAction(filter)
                              setResourceStatsOpen(false)
                            }}
                          >
                            <span className="tm-pm-gantt-view-option-label">{label}</span>
                            <span className="tm-pm-gantt-view-option-check" aria-hidden="true">
                              {checked ? <IconCheck size={14} /> : null}
                            </span>
                          </button>
                        )
                      })}
                    </div>,
                    document.body,
                  )
                : null}
            </span>
            ) : null}

            {trailingTypeItems.map(renderToolbarItem)}
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
