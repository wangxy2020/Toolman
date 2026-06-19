import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { P2pMember, P2pMemberRole } from '@toolman/shared'
import { IconCheck } from '../../components/icons'
import { getAssignableRoles, MEMBER_ROLE_LABELS } from './group-member-utils'

interface Props {
  x: number
  y: number
  member: P2pMember
  actorRole: P2pMemberRole | null
  selfMemberId: string | null
  busy?: boolean
  onClose: () => void
  onSelectRole: (role: P2pMemberRole) => void
  onRemove: () => void
}

export function GroupMemberContextMenu({
  x,
  y,
  member,
  actorRole,
  selfMemberId,
  busy = false,
  onClose,
  onSelectRole,
  onRemove,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const assignableRoles = getAssignableRoles(actorRole ?? undefined, member, selfMemberId)

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label="关闭菜单"
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={{ top: y, left: x }} role="menu">
        {assignableRoles.map((role) => {
          const active = member.role === role
          return (
            <button
              key={role}
              type="button"
              className={[
                'tm-group-context-menu-item',
                'tm-group-context-menu-item--checkable',
                active ? 'tm-group-context-menu-item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="menuitemradio"
              aria-checked={active}
              disabled={busy || active}
              onClick={() => {
                onSelectRole(role)
                onClose()
              }}
            >
              <span className="tm-group-context-menu-item-label">
                设为{MEMBER_ROLE_LABELS[role]}
              </span>
              <span className="tm-group-context-menu-item-check" aria-hidden="true">
                {active ? <IconCheck size={14} /> : null}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          className={[
            'tm-group-context-menu-item',
            'tm-group-context-menu-item--danger',
            busy ? 'tm-group-context-menu-item--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menuitem"
          disabled={busy}
          onClick={() => {
            onRemove()
            onClose()
          }}
        >
          移出群组
        </button>
      </div>
    </>,
    document.body,
  )
}
