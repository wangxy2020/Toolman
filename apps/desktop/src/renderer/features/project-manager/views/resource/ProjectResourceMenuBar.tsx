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
import { PM_RESOURCE_TYPES, type PmResourceType } from './pm-resource-catalog'

const ICON_SIZE = 16

export type ResourceViewFilter = 'all' | PmResourceType

export type ResourceMenuAction =
  | 'save'
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

export type ResourceVersionSwitchEntry = {
  version: number
  name: string
  hasSnapshot: boolean
  isCurrent: boolean
}

type MenuItem = {
  key: ResourceMenuAction
  title: string
  label: ReactNode
  disabled?: boolean
  dividerAfter?: boolean
  icon?: boolean
}

type ScrollMetrics = {
  overflowing: boolean
  thumbSize: number
  thumbOffset: number
}

type TooltipState = { text: string; top: number; left: number }

const EMPTY_SCROLL: ScrollMetrics = { overflowing: false, thumbSize: 1, thumbOffset: 0 }

interface Props {
  disabled?: boolean
  hasSelection: boolean
  /** Enables 项目信息 — true for a concrete project or「全部项目」. */
  hasProject?: boolean
  canEdit?: boolean
  canUndo?: boolean
  canRedo?: boolean
  /** Table type filter; `all` shows every resource type. */
  viewFilter: ResourceViewFilter
  onViewFilterChange: (filter: ResourceViewFilter) => void
  selectedType: PmResourceType
  onTypeChange: (type: PmResourceType) => void
  versionSwitchEntries: ResourceVersionSwitchEntry[]
  onRestoreVersion: (version: number) => void
  onAction: (action: ResourceMenuAction) => void
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

export function ProjectResourceMenuBar({
  disabled = false,
  hasSelection,
  hasProject = false,
  canEdit = true,
  canUndo = false,
  canRedo = false,
  viewFilter,
  onViewFilterChange,
  selectedType,
  onTypeChange,
  versionSwitchEntries,
  onRestoreVersion,
  onAction,
}: Props) {
  const { t } = useI18n()
  const [viewOpen, setViewOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>(EMPTY_SCROLL)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const viewRef = useRef<HTMLSpanElement>(null)
  const typeRef = useRef<HTMLSpanElement>(null)
  const baselineRef = useRef<HTMLSpanElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewPos = useDropdownPos(viewOpen, viewRef)
  const typePos = useDropdownPos(typeOpen, typeRef)
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
    if (!viewOpen && !typeOpen && !baselineOpen) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (viewOpen && viewRef.current?.contains(target)) return
      if (typeOpen && typeRef.current?.contains(target)) return
      if (baselineOpen && baselineRef.current?.contains(target)) return
      if ((target as Element).closest?.('.tm-pm-gantt-view-panel')) return
      setViewOpen(false)
      setTypeOpen(false)
      setBaselineOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [baselineOpen, typeOpen, viewOpen])

  const viewMenuLabel = t('projectManagerPage.resourceTable.menu.view')
  const viewCurrentLabel =
    viewFilter === 'all'
      ? t('projectManagerPage.resourceTable.views.allTypes')
      : t(`projectManagerPage.resourceTable.types.${viewFilter}`)
  const typeMenuLabel = t('projectManagerPage.resourceTable.menu.type')
  const typeLabel = t(`projectManagerPage.resourceTable.types.${selectedType}`)
  const baselineMenuLabel = t('projectManagerPage.resourceTable.menu.baseline')

  const items: MenuItem[] = [
    {
      key: 'save',
      title: t('projectManagerPage.resourceTable.menu.save'),
      label: <IconSave size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'print',
      title: t('projectManagerPage.resourceTable.menu.print'),
      label: <IconPrint size={ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'projectInfo',
      title: t('projectManagerPage.resourceTable.menu.projectInfo'),
      label: <IconProjectInfo size={ICON_SIZE} />,
      icon: true,
      disabled: !hasProject,
    },
    {
      key: 'undo',
      title: t('projectManagerPage.resourceTable.menu.undo'),
      label: <IconUndo size={ICON_SIZE} />,
      icon: true,
      disabled: !canUndo,
    },
    {
      key: 'redo',
      title: t('projectManagerPage.resourceTable.menu.redo'),
      label: <IconRedo size={ICON_SIZE} />,
      icon: true,
      disabled: !canRedo,
      dividerAfter: true,
    },
    {
      key: 'add',
      title: t('projectManagerPage.resourceTable.menu.add'),
      label: <IconPlus size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'insert',
      title: t('projectManagerPage.resourceTable.menu.insert'),
      label: <IconInsertRow size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit || !hasSelection,
    },
    {
      key: 'delete',
      title: t('projectManagerPage.resourceTable.menu.delete'),
      label: <IconTrash size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.resourceTable.menu.indent'),
      label: <IconIndent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.resourceTable.menu.outdent'),
      label: <IconOutdent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'moveUp',
      title: t('projectManagerPage.resourceTable.menu.moveUp'),
      label: <IconChevronUp size={ICON_SIZE} />,
      disabled: !hasSelection,
      icon: true,
    },
    {
      key: 'moveDown',
      title: t('projectManagerPage.resourceTable.menu.moveDown'),
      label: <IconChevronDown size={ICON_SIZE} />,
      disabled: !hasSelection,
      icon: true,
    },
  ]

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
          onClick={() => {
            if (isDisabled) return
            hideTip()
            onAction(item.key)
          }}
          {...tipProps(item.title)}
        >
          {item.label}
        </button>
        {item.dividerAfter ? <span className="tm-pm-resource-menubar-divider" /> : null}
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

  return (
    <div
      className={[
        'tm-pm-resource-menubar',
        scrollMetrics.overflowing ? 'tm-pm-resource-menubar--overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
      aria-label={t('projectManagerPage.resourceTable.menu.barLabel')}
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
                  setBaselineOpen(false)
                  setViewOpen((open) => !open)
                }}
                {...tipProps(viewMenuLabel)}
              >
                <span>{viewMenuLabel}</span>
                <span className="tm-pm-gantt-view-current">{viewCurrentLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {viewOpen && viewPos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel tm-pm-resource-view-panel"
                      role="menu"
                      style={{ top: viewPos.top, left: viewPos.left }}
                    >
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={viewFilter === 'all'}
                        className={[
                          'tm-pm-gantt-view-option',
                          viewFilter === 'all' ? 'tm-pm-gantt-view-option--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          onViewFilterChange('all')
                          setViewOpen(false)
                        }}
                      >
                        {t('projectManagerPage.resourceTable.views.allTypes')}
                      </button>
                      {PM_RESOURCE_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          role="menuitemradio"
                          aria-checked={viewFilter === type}
                          className={[
                            'tm-pm-gantt-view-option',
                            viewFilter === type ? 'tm-pm-gantt-view-option--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            onViewFilterChange(type)
                            setViewOpen(false)
                          }}
                        >
                          {t(`projectManagerPage.resourceTable.types.${type}`)}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )
                : null}
              <span className="tm-pm-resource-menubar-divider" />
            </span>

            {leadingItems.map(renderToolbarItem)}
            {hierarchyItems.map(renderToolbarItem)}

            <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={typeRef}>
              <button
                type="button"
                className="tm-pm-resource-menubar-btn"
                aria-label={typeMenuLabel}
                aria-disabled={disabled || !hasSelection}
                aria-expanded={typeOpen}
                onClick={() => {
                  if (disabled || !hasSelection) return
                  hideTip()
                  setViewOpen(false)
                  setBaselineOpen(false)
                  setTypeOpen((open) => !open)
                }}
                {...tipProps(typeMenuLabel)}
              >
                <span>{typeMenuLabel}</span>
                <span className="tm-pm-gantt-view-current">{typeLabel}</span>
                <IconChevronDown size={14} />
              </button>
              {typeOpen && typePos
                ? createPortal(
                    <div
                      className="tm-pm-gantt-view-panel tm-pm-gantt-type-panel"
                      role="menu"
                      style={{ top: typePos.top, left: typePos.left }}
                    >
                      {PM_RESOURCE_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedType === type}
                          className={[
                            'tm-pm-gantt-view-option',
                            selectedType === type ? 'tm-pm-gantt-view-option--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            onTypeChange(type)
                            setTypeOpen(false)
                          }}
                        >
                          {t(`projectManagerPage.resourceTable.types.${type}`)}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )
                : null}
              <span className="tm-pm-resource-menubar-divider" />
            </span>

            {moveItems.map(renderToolbarItem)}

            <span className="tm-pm-resource-menubar-item tm-pm-gantt-view-menu" ref={baselineRef}>
              <button
                type="button"
                className="tm-pm-resource-menubar-btn"
                aria-label={baselineMenuLabel}
                aria-disabled={disabled || !hasProject}
                aria-expanded={baselineOpen}
                onClick={() => {
                  if (disabled || !hasProject) return
                  hideTip()
                  setViewOpen(false)
                  setTypeOpen(false)
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
                        {t('projectManagerPage.resourceTable.versionSwitch')}
                      </div>
                      {versionSwitchEntries.length === 0 ? (
                        <div className="tm-pm-gantt-submenu-empty">
                          {t('projectManagerPage.resourceTable.versionSwitchEmpty')}
                        </div>
                      ) : (
                        versionSwitchEntries.map((entry) => {
                          const canSwitch = entry.hasSnapshot && !entry.isCurrent
                          return (
                            <button
                              key={`restore-resource-v-${entry.version}`}
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
                                  : t('projectManagerPage.resourceTable.versionSwitchNoSnapshot')
                              }
                              onClick={() => {
                                if (!canSwitch) return
                                onRestoreVersion(entry.version)
                                setBaselineOpen(false)
                              }}
                            >
                              {t('projectManagerPage.resourceTable.switchToVersion', {
                                name: entry.name,
                              })}
                              {entry.isCurrent
                                ? ` · ${t('projectManagerPage.projectInfo.saveHistoryCurrent')}`
                                : ''}
                              {!entry.hasSnapshot
                                ? ` · ${t('projectManagerPage.resourceTable.versionSwitchNoSnapshotShort')}`
                                : ''}
                            </button>
                          )
                        })
                      )}
                    </div>,
                    document.body,
                  )
                : null}
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
