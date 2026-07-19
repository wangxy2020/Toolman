import type {
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
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
  IconTrash,
  IconUndo,
} from '../../../../components/icons'
import { useI18n } from '../../../../i18n/useI18n'
import type { GanttScheduleView } from './pm-gantt-prefs'

const ICON_SIZE = 16

export type GanttMenuAction =
  | 'save'
  | 'print'
  | 'projectInfo'
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
  | 'deleteBaseline'
  | 'openResource'
  | 'openCost'
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

type DropdownKey = 'view' | 'type' | 'baseline' | 'analysis'

interface Props {
  disabled?: boolean
  hasSelection: boolean
  hasProject?: boolean
  canUndo?: boolean
  canRedo?: boolean
  canSetTaskType: boolean
  selectedTaskType: GanttLeafTaskType
  scheduleView: GanttScheduleView
  onScheduleViewChange: (view: GanttScheduleView) => void
  baselines: Array<{ id: string; name: string }>
  selectedBaselineId: string | null
  onSelectBaseline: (id: string | null) => void
  versionSwitchEntries: GanttVersionSwitchEntry[]
  onRestoreBaseline: (id: string) => void
  onAction: (action: GanttMenuAction) => void
}

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

type ScrollMetrics = {
  overflowing: boolean
  thumbSize: number
  thumbOffset: number
}

type TooltipState = { text: string; top: number; left: number }

const EMPTY_SCROLL: ScrollMetrics = { overflowing: false, thumbSize: 1, thumbOffset: 0 }

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
  baselines,
  selectedBaselineId,
  onSelectBaseline,
  versionSwitchEntries,
  onRestoreBaseline,
  onAction,
}: Props) {
  const { t } = useI18n()
  const [openMenu, setOpenMenu] = useState<DropdownKey | null>(null)
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>(EMPTY_SCROLL)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const viewRef = useRef<HTMLSpanElement>(null)
  const typeRef = useRef<HTMLSpanElement>(null)
  const baselineRef = useRef<HTMLSpanElement>(null)
  const analysisRef = useRef<HTMLSpanElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const viewPos = useDropdownPos(openMenu === 'view', viewRef)
  const typePos = useDropdownPos(openMenu === 'type', typeRef)
  const baselinePos = useDropdownPos(openMenu === 'baseline', baselineRef)
  const analysisPos = useDropdownPos(openMenu === 'analysis', analysisRef)

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

  const toggleMenu = (key: DropdownKey) => {
    setOpenMenu((current) => (current === key ? null : key))
  }

  useEffect(() => {
    if (!openMenu) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      const refs: Array<[DropdownKey, React.RefObject<HTMLElement | null>]> = [
        ['view', viewRef],
        ['type', typeRef],
        ['baseline', baselineRef],
        ['analysis', analysisRef],
      ]
      for (const [key, ref] of refs) {
        if (openMenu !== key) continue
        if (ref.current?.contains(target)) return
        if ((target as Element).closest?.('.tm-pm-gantt-view-panel')) return
      }
      setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openMenu])

  const structureLocked = scheduleView === 'resource'

  const items: MenuItem[] = [
    {
      key: 'save',
      title: t('projectManagerPage.schedule.menu.save'),
      label: <IconSave size={ICON_SIZE} />,
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

  const viewLabelByMode: Record<GanttScheduleView, string> = {
    list: t('projectManagerPage.schedule.views.list'),
    gantt: t('projectManagerPage.schedule.views.gantt'),
    resource: t('projectManagerPage.schedule.views.resource'),
    cost: t('projectManagerPage.schedule.views.cost'),
  }

  const typeLabel =
    selectedTaskType === 'milestone'
      ? t('projectManagerPage.schedule.menu.setMilestone')
      : t('projectManagerPage.schedule.menu.setTask')

  const leadingItems = items.slice(0, 8)
  const hierarchyItems = items.slice(8, 10)
  const moveItems = items.slice(10)

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
    key: DropdownKey,
    ref: React.RefObject<HTMLSpanElement | null>,
    label: string,
    current?: string,
    buttonDisabled = disabled,
  ) => (
    <span className="tm-pm-gantt-menubar-item tm-pm-gantt-view-menu" ref={ref}>
      <button
        type="button"
        className="tm-pm-gantt-menubar-btn"
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
        {current ? <span className="tm-pm-gantt-view-current">{current}</span> : null}
        <IconChevronDown size={14} />
      </button>
      <span className="tm-pm-gantt-menubar-divider" />
    </span>
  )

  const renderNavButton = (action: GanttMenuAction, label: string, active = false) => (
    <span className="tm-pm-gantt-menubar-item">
      <button
        type="button"
        className={[
          'tm-pm-gantt-menubar-btn',
          active ? 'tm-pm-gantt-menubar-btn--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        aria-disabled={disabled}
        onClick={() => {
          if (disabled) return
          hideTip()
          onAction(action)
        }}
        {...tipProps(label)}
      >
        <span>{label}</span>
      </button>
      <span className="tm-pm-gantt-menubar-divider" />
    </span>
  )

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
              viewLabelByMode[scheduleView],
            )}
            {openMenu === 'view' &&
              renderPanel(
                viewPos,
                (['list', 'gantt', 'resource', 'cost'] as const).map((view) => (
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
              undefined,
              disabled || structureLocked,
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
                    {t('projectManagerPage.schedule.baselineSelect')}
                  </div>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedBaselineId == null}
                    className={[
                      'tm-pm-gantt-view-option',
                      selectedBaselineId == null ? 'tm-pm-gantt-view-option--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      onSelectBaseline(null)
                      setOpenMenu(null)
                    }}>
                    {t('projectManagerPage.schedule.baselineCompareNone')}
                  </button>
                  {baselines.length === 0 ? (
                    <div className="tm-pm-gantt-submenu-empty">
                      {t('projectManagerPage.schedule.baselineEmpty')}
                    </div>
                  ) : (
                    baselines.map((entry) => (
                      <button
                        key={`compare-${entry.id}`}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedBaselineId === entry.id}
                        className={[
                          'tm-pm-gantt-view-option',
                          selectedBaselineId === entry.id ? 'tm-pm-gantt-view-option--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          onSelectBaseline(
                            selectedBaselineId === entry.id ? null : entry.id,
                          )
                          setOpenMenu(null)
                        }}>
                        {entry.name}
                      </button>
                    ))
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
                      onAction('deleteBaseline')
                      setOpenMenu(null)
                    }}>
                    {t('projectManagerPage.schedule.deleteBaseline')}
                  </button>
                </>,
              )}

            {renderNavButton(
              'openResource',
              t('projectManagerPage.schedule.menu.resource'),
              scheduleView === 'resource',
            )}
            {renderNavButton(
              'openCost',
              t('projectManagerPage.schedule.menu.cost'),
              scheduleView === 'cost',
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
