import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { P2pSharedResourcePermission } from '@toolman/shared'
import { IconCheck } from '../../components/icons'

export type GroupNoteAction = 'read' | 'edit' | 'save-as'

interface Props {
  x: number
  y: number
  align?: 'bottom-start'
  permission: P2pSharedResourcePermission
  canSetPermission: boolean
  onClose: () => void
  onSelect: (action: GroupNoteAction) => void | Promise<void>
}

function PermissionMenuItem({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={[
        'tm-group-context-menu-item',
        'tm-group-context-menu-item--checkable',
        active ? 'tm-group-context-menu-item--active' : '',
        disabled ? 'tm-group-context-menu-item--disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="menuitemradio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="tm-group-context-menu-item-label">{label}</span>
      <span className="tm-group-context-menu-item-check" aria-hidden="true">
        {active ? <IconCheck size={14} /> : null}
      </span>
    </button>
  )
}

export function GroupNoteActionMenu({
  x,
  y,
  align = 'bottom-start',
  permission,
  canSetPermission,
  onClose,
  onSelect,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const isReadPermission = permission === 'read'
  const isWritePermission = permission === 'write' || permission === 'admin'

  const menuStyle: CSSProperties =
    align === 'bottom-start'
      ? { top: y, left: x, transform: 'translateX(-100%)' }
      : { top: y, left: x }

  const handlePermissionSelect = (action: 'read' | 'edit') => {
    if (!canSetPermission) return
    void onSelect(action)
  }

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label="关闭菜单"
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={menuStyle} role="menu">
        <PermissionMenuItem
          label="仅阅读"
          active={isReadPermission}
          disabled={!canSetPermission}
          onClick={() => handlePermissionSelect('read')}
        />
        <PermissionMenuItem
          label="可编辑"
          active={isWritePermission}
          disabled={!canSetPermission}
          onClick={() => handlePermissionSelect('edit')}
        />
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            void onSelect('save-as')
            onClose()
          }}
        >
          另存为
        </button>
      </div>
    </>,
    document.body,
  )
}
