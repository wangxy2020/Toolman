import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconPrint,
  IconProjectInfo,
  IconSave,
  IconTrash,
} from '../../../../components/icons'
import { useI18n } from '../../../../i18n/useI18n'
import { PM_RESOURCE_TYPES, type PmResourceType } from './pm-resource-catalog'

const ICON_SIZE = 16

export type ResourceMenuAction =
  | 'save'
  | 'print'
  | 'projectInfo'
  | 'add'
  | 'insert'
  | 'delete'
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'

type MenuItem = {
  key: ResourceMenuAction
  title: string
  label: ReactNode
  disabled?: boolean
  dividerAfter?: boolean
  icon?: boolean
}

interface Props {
  disabled?: boolean
  hasSelection: boolean
  /** Enables 项目信息 — true for a concrete project or「全部项目」. */
  hasProject?: boolean
  canEdit?: boolean
  selectedType: PmResourceType
  onTypeChange: (type: PmResourceType) => void
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
  selectedType,
  onTypeChange,
  onAction,
}: Props) {
  const { t } = useI18n()
  const [typeOpen, setTypeOpen] = useState(false)
  const typeRef = useRef<HTMLSpanElement>(null)
  const typePos = useDropdownPos(typeOpen, typeRef)

  useEffect(() => {
    if (!typeOpen) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (typeRef.current?.contains(target)) return
      if ((target as Element).closest?.('.tm-pm-gantt-view-panel')) return
      setTypeOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [typeOpen])

  const typeLabel = t(`projectManagerPage.resourceTable.types.${selectedType}`)

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
      dividerAfter: true,
    },
    {
      key: 'add',
      title: t('projectManagerPage.resourceTable.menu.add'),
      label: (
        <>
          <IconPlus size={ICON_SIZE} />
          <span>{t('projectManagerPage.resourceTable.menu.add')}</span>
        </>
      ),
      disabled: !canEdit,
    },
    {
      key: 'insert',
      title: t('projectManagerPage.resourceTable.menu.insert'),
      label: t('projectManagerPage.resourceTable.menu.insert'),
      disabled: !canEdit || !hasSelection,
    },
    {
      key: 'delete',
      title: t('projectManagerPage.resourceTable.menu.delete'),
      label: (
        <>
          <IconTrash size={ICON_SIZE} />
          <span>{t('projectManagerPage.resourceTable.menu.delete')}</span>
        </>
      ),
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.resourceTable.menu.indent'),
      label: t('projectManagerPage.resourceTable.menu.indent'),
      disabled: !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.resourceTable.menu.outdent'),
      label: t('projectManagerPage.resourceTable.menu.outdent'),
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

  const leadingItems = items.slice(0, 6)
  const hierarchyItems = items.slice(6, 8)
  const moveItems = items.slice(8)

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

  return (
    <div
      className="tm-notes-toolbar tm-pm-gantt-toolbar"
      role="toolbar"
      aria-label={t('projectManagerPage.resourceTable.menu.barLabel')}>
      <div className="tm-notes-toolbar-group tm-pm-gantt-toolbar-group">
        {leadingItems.map(renderToolbarItem)}
        {hierarchyItems.map(renderToolbarItem)}

        <span className="tm-notes-toolbar-item tm-pm-gantt-type-menu" ref={typeRef}>
          <button
            type="button"
            className="tm-notes-toolbar-btn"
            title={t('projectManagerPage.resourceTable.menu.type')}
            disabled={disabled || !hasSelection}
            aria-expanded={typeOpen}
            onClick={() => setTypeOpen((open) => !open)}>
            <span className="tm-pm-gantt-view-current">{typeLabel}</span>
            <IconChevronDown size={14} />
          </button>
          {typeOpen && typePos
            ? createPortal(
                <div
                  className="tm-pm-gantt-view-panel tm-pm-gantt-type-panel"
                  role="menu"
                  style={{ top: typePos.top, left: typePos.left }}>
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
                      }}>
                      {t(`projectManagerPage.resourceTable.types.${type}`)}
                    </button>
                  ))}
                </div>,
                document.body,
              )
            : null}
          <span className="tm-notes-toolbar-divider" />
        </span>

        {moveItems.map(renderToolbarItem)}
      </div>
    </div>
  )
}
