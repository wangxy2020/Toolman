import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'

import {
  IconChevronDown,
  IconChevronUp,
  IconIndent,
  IconInsertRow,
  IconLink,
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
import type { GanttMenuDropdownKey } from './useProjectGanttMenuBar'
import type { GanttMenuAction, GanttMenuItem } from './ProjectGanttMenuBarTypes'

export const GANTT_MENU_ICON_SIZE = 16

export function buildGanttMenuItems(input: {
  t: (key: string) => string
  hasProject: boolean
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
  structureLocked: boolean
}): GanttMenuItem[] {
  const { t, hasProject, canUndo, canRedo, hasSelection, structureLocked } = input
  return [
    {
      key: 'save',
      title: t('projectManagerPage.schedule.menu.save'),
      label: <IconSave size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'saveAsNewVersion',
      title: t('projectManagerPage.schedule.menu.saveAsNewVersion'),
      label: <IconSaveAsNewVersion size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'print',
      title: t('projectManagerPage.schedule.menu.print'),
      label: <IconPrint size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'projectInfo',
      title: t('projectManagerPage.schedule.menu.projectInfo'),
      label: <IconProjectInfo size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: !hasProject,
    },
    {
      key: 'link',
      title: t('projectManagerPage.schedule.menu.link'),
      label: <IconLink size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: true,
    },
    {
      key: 'undo',
      title: t('projectManagerPage.schedule.menu.undo'),
      label: <IconUndo size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: !canUndo,
    },
    {
      key: 'redo',
      title: t('projectManagerPage.schedule.menu.redo'),
      label: <IconRedo size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: !canRedo,
      dividerAfter: true,
    },
    {
      key: 'newTask',
      title: t('projectManagerPage.schedule.menu.newTask'),
      label: <IconPlus size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: structureLocked,
    },
    {
      key: 'insertTask',
      title: t('projectManagerPage.schedule.menu.insertTask'),
      label: <IconInsertRow size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: structureLocked,
    },
    {
      key: 'deleteTask',
      title: t('projectManagerPage.schedule.menu.deleteTask'),
      label: <IconTrash size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: structureLocked || !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.schedule.menu.indent'),
      label: <IconIndent size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: structureLocked || !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.schedule.menu.outdent'),
      label: <IconOutdent size={GANTT_MENU_ICON_SIZE} />,
      icon: true,
      disabled: structureLocked || !hasSelection,
    },
    {
      key: 'moveUp',
      title: t('projectManagerPage.schedule.menu.moveUp'),
      label: <IconChevronUp size={GANTT_MENU_ICON_SIZE} />,
      disabled: structureLocked || !hasSelection,
      icon: true,
    },
    {
      key: 'moveDown',
      title: t('projectManagerPage.schedule.menu.moveDown'),
      label: <IconChevronDown size={GANTT_MENU_ICON_SIZE} />,
      disabled: structureLocked || !hasSelection,
      icon: true,
    },
  ]
}

export function renderGanttToolbarItem(
  item: GanttMenuItem,
  options: {
    disabled: boolean
    hideTip: () => void
    onAction: (action: GanttMenuAction) => void
    tipProps: (title: string) => Record<string, unknown>
  },
) {
  const isDisabled = Boolean(options.disabled || item.disabled)
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
          options.hideTip()
          options.onAction(item.key)
        }}
        {...options.tipProps(item.title)}
      >
        {item.label}
      </button>
      {item.dividerAfter ? <span className="tm-pm-gantt-menubar-divider" /> : null}
    </span>
  )
}

export function renderGanttMenuPanel(
  pos: { top: number; left: number } | null,
  children: ReactNode,
  className = 'tm-pm-gantt-view-panel',
) {
  return pos
    ? createPortal(
        <div className={className} role="menu" style={{ top: pos.top, left: pos.left }}>
          {children}
        </div>,
        document.body,
      )
    : null
}

export function renderGanttMenuButton(
  key: GanttMenuDropdownKey,
  ref: RefObject<HTMLSpanElement | null>,
  label: string,
  options: {
    openMenu: GanttMenuDropdownKey | null
    hideTip: () => void
    toggleMenu: (key: GanttMenuDropdownKey) => void
    tipProps: (title: string) => Record<string, unknown>
    current?: string
    active?: boolean
    dividerAfter?: boolean
    buttonDisabled?: boolean
  },
) {
  const buttonDisabled = options.buttonDisabled ?? false
  const dividerAfter = options.dividerAfter !== false
  return (
    <span className="tm-pm-gantt-menubar-item tm-pm-gantt-view-menu" ref={ref}>
      <button
        type="button"
        className={[
          'tm-pm-gantt-menubar-btn',
          options.active ? 'tm-pm-gantt-menubar-btn--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        aria-disabled={buttonDisabled}
        aria-expanded={options.openMenu === key}
        onClick={() => {
          if (buttonDisabled) return
          options.hideTip()
          options.toggleMenu(key)
        }}
        {...options.tipProps(label)}
      >
        <span>{label}</span>
        {options.current ? (
          <span className="tm-pm-gantt-view-current">{options.current}</span>
        ) : null}
        <IconChevronDown size={14} />
      </button>
      {dividerAfter ? <span className="tm-pm-gantt-menubar-divider" /> : null}
    </span>
  )
}
