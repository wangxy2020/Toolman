import type {
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { useEffect, useRef, useState } from 'react'
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
import { useI18n } from '../../../../i18n/useI18n'

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

export type FeaturesRowType =
  | 'labor'
  | 'auxiliary'
  | 'material'
  | 'machinery'
  | 'device'
  | 'instrument'
  | 'procurement'
  | 'metering'
  | 'node'
  | 'funds'

export type FeaturesViewFilter = FeaturesRowType | 'scheduleAll'

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

interface Props {
  disabled?: boolean
  hasSelection?: boolean
  hasProject?: boolean
  canUndo?: boolean
  canRedo?: boolean
  canEdit?: boolean
  /** Highlights the matching type /「全部」button. */
  selectedType?: FeaturesViewFilter
  scheduleView: FeaturesScheduleView
  onScheduleViewChange: (view: FeaturesScheduleView) => void
  versionSwitchEntries?: FeaturesVersionSwitchEntry[]
  onRestoreVersion?: (version: number) => void
  onAction: (action: FeaturesMenuAction) => void
}

type ScrollMetrics = {
  overflowing: boolean
  thumbSize: number
  thumbOffset: number
}

type TooltipState = { text: string; top: number; left: number }

const EMPTY_SCROLL: ScrollMetrics = { overflowing: false, thumbSize: 1, thumbOffset: 0 }

function useDropdownPos(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const updatePos = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open, anchorRef])
  return pos
}

export function ProjectFeaturesMenuBar({
  disabled = false,
  hasSelection = false,
  hasProject = false,
  canUndo = false,
  canRedo = false,
  canEdit = true,
  selectedType,
  scheduleView,
  onScheduleViewChange,
  versionSwitchEntries = [],
  onRestoreVersion,
  onAction,
}: Props) {
  const { t } = useI18n()
  const [viewOpen, setViewOpen] = useState(false)
  const [resourceStatsOpen, setResourceStatsOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>(EMPTY_SCROLL)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const viewRef = useRef<HTMLSpanElement>(null)
  const resourceStatsRef = useRef<HTMLSpanElement>(null)
  const baselineRef = useRef<HTMLSpanElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewPos = useDropdownPos(viewOpen, viewRef)
  const resourceStatsPos = useDropdownPos(resourceStatsOpen, resourceStatsRef)
  const baselinePos = useDropdownPos(baselineOpen, baselineRef)

  const syncScrollMetrics = () => {
    const el = scrollRef.current
    if (!el) return
    const { scrollWidth, clientWidth, scrollLeft } = el
    const overflowing = scrollWidth > clientWidth + 1
    if (!overflowing) {
      setScrollMetrics(EMPTY_SCROLL)
      return
    }
    const thumbSize = Math.min(1, clientWidth / scrollWidth)
    const maxScroll = scrollWidth - clientWidth
    const thumbOffset = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * (1 - thumbSize)
    setScrollMetrics({ overflowing: true, thumbSize, thumbOffset })
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    syncScrollMetrics()
    const ro = new ResizeObserver(() => syncScrollMetrics())
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    window.addEventListener('resize', syncScrollMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncScrollMetrics)
    }
  }, [])

  useEffect(() => {
    if (!viewOpen && !resourceStatsOpen && !baselineOpen) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (viewOpen && viewRef.current?.contains(target)) return
      if (resourceStatsOpen && resourceStatsRef.current?.contains(target)) return
      if (baselineOpen && baselineRef.current?.contains(target)) return
      if ((target as Element).closest?.('.tm-pm-gantt-view-panel')) return
      setViewOpen(false)
      setResourceStatsOpen(false)
      setBaselineOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [baselineOpen, resourceStatsOpen, viewOpen])

  const viewLabelByMode: Record<FeaturesScheduleView, string> = {
    list: t('projectManagerPage.schedule.views.list'),
    gantt: t('projectManagerPage.schedule.views.gantt'),
    progressCheck: t('projectManagerPage.schedule.views.progressCheck'),
    resource: t('projectManagerPage.schedule.views.resource'),
    cost: t('projectManagerPage.schedule.views.cost'),
  }
  const baselineMenuLabel = t('projectManagerPage.files.menu.baseline')
  const resourceStatsMenuLabel = t('projectManagerPage.files.menu.resourceStatistics')
  const resourceStatMode = isFeaturesResourceStatFilter(selectedType)
  const resourceStatCurrent: FeaturesResourceStatFilter | null = resourceStatMode
    ? selectedType
    : null
  const resourceStatCurrentLabel =
    resourceStatCurrent == null
      ? null
      : resourceStatCurrent === 'scheduleAll'
        ? t('projectManagerPage.files.menu.scheduleAll')
        : t(`projectManagerPage.files.menu.${resourceStatCurrent}`)
  const resourceStatsTip =
    resourceStatCurrentLabel != null
      ? `${resourceStatsMenuLabel} · ${resourceStatCurrentLabel}`
      : resourceStatsMenuLabel

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
      key: 'metering',
      title: t('projectManagerPage.files.menu.metering'),
      label: t('projectManagerPage.files.menu.metering'),
      active: selectedType === 'metering',
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

  const hideTip = () => setTooltip(null)

  const showTipFromEl = (el: HTMLElement, text: string) => {
    const rect = el.getBoundingClientRect()
    setTooltip({ text, top: rect.bottom + 6, left: rect.left + rect.width / 2 })
  }

  const tipProps = (text: string) => ({
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => showTipFromEl(event.currentTarget, text),
    onMouseLeave: hideTip,
    onFocus: (event: ReactFocusEvent<HTMLElement>) => showTipFromEl(event.currentTarget, text),
    onBlur: hideTip,
  })

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

  const scrollToThumbOffset = (nextOffset: number) => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const travel = 1 - thumbSize
    const clamped = Math.max(0, Math.min(travel, nextOffset))
    el.scrollLeft = travel <= 0 ? 0 : (clamped / travel) * maxScroll
  }

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    const el = scrollRef.current
    if (!track || !el) return
    event.preventDefault()
    const trackRect = track.getBoundingClientRect()
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const pointerRatio = (event.clientX - trackRect.left) / trackRect.width
    scrollToThumbOffset(pointerRatio - thumbSize / 2)

    const onMove = (moveEvent: PointerEvent) => {
      const ratio = (moveEvent.clientX - trackRect.left) / trackRect.width
      scrollToThumbOffset(ratio - thumbSize / 2)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const viewLabel = t('projectManagerPage.files.menu.view')

  // Edit actions through moveDown; trailing type filters after resource-stats dropdown.
  const leadingItems = items.slice(0, 13)
  const trailingTypeItems = items.slice(13)

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
                <span className="tm-pm-gantt-view-current">{viewLabelByMode[scheduleView]}</span>
                <IconChevronDown size={14} />
              </button>
              {viewOpen && viewPos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel"
                      role="menu"
                      style={{ top: viewPos.top, left: viewPos.left }}
                    >
                      {(['list', 'gantt', 'progressCheck', 'resource', 'cost'] as const).map((view) => (
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
                            setViewOpen(false)
                          }}
                        >
                          {viewLabelByMode[view]}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )
                : null}
              <span className="tm-pm-features-menubar-divider" />
            </span>

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
                {...tipProps(resourceStatsTip)}
              >
                <span>{resourceStatsMenuLabel}</span>
                {resourceStatCurrentLabel != null ? (
                  <span className="tm-pm-gantt-view-current">{resourceStatCurrentLabel}</span>
                ) : null}
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
              <span className="tm-pm-features-menubar-divider" />
            </span>

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
