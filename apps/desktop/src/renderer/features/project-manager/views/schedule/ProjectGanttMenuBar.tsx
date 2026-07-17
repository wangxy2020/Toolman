import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronDown,
  IconChevronUp,
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
  const viewRef = useRef<HTMLSpanElement>(null)
  const typeRef = useRef<HTMLSpanElement>(null)
  const baselineRef = useRef<HTMLSpanElement>(null)
  const analysisRef = useRef<HTMLSpanElement>(null)

  const viewPos = useDropdownPos(openMenu === 'view', viewRef)
  const typePos = useDropdownPos(openMenu === 'type', typeRef)
  const baselinePos = useDropdownPos(openMenu === 'baseline', baselineRef)
  const analysisPos = useDropdownPos(openMenu === 'analysis', analysisRef)

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
      label: (
        <>
          <IconPlus size={ICON_SIZE} />
          <span>{t('projectManagerPage.schedule.menu.newTask')}</span>
        </>
      ),
    },
    {
      key: 'insertTask',
      title: t('projectManagerPage.schedule.menu.insertTask'),
      label: t('projectManagerPage.schedule.menu.insertTask'),
    },
    {
      key: 'deleteTask',
      title: t('projectManagerPage.schedule.menu.deleteTask'),
      label: (
        <>
          <IconTrash size={ICON_SIZE} />
          <span>{t('projectManagerPage.schedule.menu.deleteTask')}</span>
        </>
      ),
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.schedule.menu.indent'),
      label: t('projectManagerPage.schedule.menu.indent'),
      disabled: !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.schedule.menu.outdent'),
      label: t('projectManagerPage.schedule.menu.outdent'),
      disabled: !hasSelection,
    },
    {
      key: 'moveUp',
      title: t('projectManagerPage.schedule.menu.moveUp'),
      label: <IconChevronUp size={ICON_SIZE} />,
      disabled: !hasSelection,
      icon: true,
    },
    {
      key: 'moveDown',
      title: t('projectManagerPage.schedule.menu.moveDown'),
      label: <IconChevronDown size={ICON_SIZE} />,
      disabled: !hasSelection,
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

  const renderToolbarItem = (item: MenuItem) => (
    <span key={item.key} className="tm-notes-toolbar-item">
      <button
        type="button"
        className={[
          'tm-notes-toolbar-btn',
          item.icon ? 'tm-notes-toolbar-btn--icon' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={item.title}
        disabled={disabled || item.disabled}
        onClick={() => onAction(item.key)}>
        {item.label}
      </button>
      {item.dividerAfter ? <span className="tm-notes-toolbar-divider" /> : null}
    </span>
  )

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
    <span className="tm-notes-toolbar-item tm-pm-gantt-view-menu" ref={ref}>
      <button
        type="button"
        className="tm-notes-toolbar-btn"
        title={label}
        disabled={buttonDisabled}
        aria-expanded={openMenu === key}
        onClick={() => toggleMenu(key)}>
        <span>{label}</span>
        {current ? <span className="tm-pm-gantt-view-current">{current}</span> : null}
        <IconChevronDown size={14} />
      </button>
      <span className="tm-notes-toolbar-divider" />
    </span>
  )

  const renderNavButton = (action: GanttMenuAction, label: string, active = false) => (
    <span className="tm-notes-toolbar-item">
      <button
        type="button"
        className={[
          'tm-notes-toolbar-btn',
          active ? 'tm-notes-toolbar-btn--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={label}
        disabled={disabled}
        onClick={() => onAction(action)}>
        <span>{label}</span>
      </button>
      <span className="tm-notes-toolbar-divider" />
    </span>
  )

  return (
    <div
      className="tm-notes-toolbar tm-pm-gantt-toolbar"
      role="toolbar"
      aria-label={t('projectManagerPage.schedule.menu.barLabel')}>
      <div className="tm-notes-toolbar-group tm-pm-gantt-toolbar-group">
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

        <span className="tm-notes-toolbar-item tm-pm-gantt-type-menu" ref={typeRef}>
          <button
            type="button"
            className="tm-notes-toolbar-btn"
            title={t('projectManagerPage.schedule.menu.taskType')}
            disabled={disabled || !canSetTaskType}
            aria-expanded={openMenu === 'type'}
            onClick={() => toggleMenu('type')}>
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
          <span className="tm-notes-toolbar-divider" />
        </span>

        {moveItems.map(renderToolbarItem)}

        {renderMenuButton('baseline', baselineRef, t('projectManagerPage.schedule.menu.baseline'))}
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
  )
}
