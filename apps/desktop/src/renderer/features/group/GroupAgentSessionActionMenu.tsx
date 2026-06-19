import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { P2pAgentSessionPermission } from '@toolman/shared'
import { IconCheck } from '../../components/icons'

export type GroupAgentSessionAction = 'read' | 'callable'

interface Props {
  x: number
  y: number
  align?: 'bottom-start'
  permission: P2pAgentSessionPermission
  canSetPermission: boolean
  onClose: () => void
  onSelect: (action: GroupAgentSessionAction) => void | Promise<void>
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

export function GroupAgentSessionActionMenu({
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

  const menuStyle: CSSProperties =
    align === 'bottom-start'
      ? { top: y, left: x, transform: 'translateX(-100%)' }
      : { top: y, left: x }

  const handlePermissionSelect = (action: GroupAgentSessionAction) => {
    if (!canSetPermission || permission === action) return
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
          active={permission === 'read'}
          disabled={!canSetPermission}
          onClick={() => handlePermissionSelect('read')}
        />
        <PermissionMenuItem
          label="可调用"
          active={permission === 'callable'}
          disabled={!canSetPermission}
          onClick={() => handlePermissionSelect('callable')}
        />
      </div>
    </>,
    document.body,
  )
}
