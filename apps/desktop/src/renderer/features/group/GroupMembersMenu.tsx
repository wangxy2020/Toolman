import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { P2pMember, P2pMemberRole } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconMoreHorizontal, IconPlus } from '../../components/icons'
import { GroupMemberContextMenu } from './GroupMemberContextMenu'
import { canManageTargetMember, MEMBER_ROLE_LABELS } from './group-member-utils'

const CONNECTION_MODE_LABELS = {
  lan: '局域网',
  wan: '广域网',
} as const

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  workspaceName: string
  members: P2pMember[]
  selfMemberId: string | null
  selfMemberRole: P2pMemberRole | null
  canManageMembers: boolean
  loading?: boolean
  onClose: () => void
  onInvite?: () => void
  onRemoveMember?: (memberId: string) => Promise<void>
  onUpdateMemberRole?: (memberId: string, role: P2pMemberRole) => Promise<void>
}

function shortDeviceId(deviceId: string): string {
  if (deviceId.length <= 16) return deviceId
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`
}

function memberInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

function isPortaledGroupMemberOverlayTarget(target: Node): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest('.tm-group-context-menu') ||
      target.closest('.tm-group-context-menu-backdrop') ||
      target.closest('.tm-modal-overlay'),
  )
}

export function GroupMembersMenu({
  open,
  anchorRef,
  workspaceName,
  members,
  selfMemberId,
  selfMemberRole,
  canManageMembers,
  loading,
  onClose,
  onInvite,
  onRemoveMember,
  onUpdateMemberRole,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    member: P2pMember
  } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<P2pMember | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setContextMenu(null)
      setRemoveTarget(null)
    }
  }, [open])
  const activeMembers = members.filter((member) => member.status === 'active')
  const canManage = Boolean(onRemoveMember && onUpdateMemberRole)

  useEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(12, rect.right - 320),
    })
  }, [anchorRef, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      if (isPortaledGroupMemberOverlayTarget(target)) return
      onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [anchorRef, onClose, open])

  useEffect(() => {
    if (!contextMenu) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (target instanceof Element) {
        if (target.closest('.tm-group-context-menu')) return
        if (target.classList.contains('tm-group-context-menu-backdrop')) return
      }
      setContextMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu])

  const openManageMenu = useCallback(
    (event: React.MouseEvent, member: P2pMember) => {
      event.preventDefault()
      event.stopPropagation()
      if (!canManageTargetMember(selfMemberRole ?? undefined, member, selfMemberId)) return
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        member,
      })
    },
    [selfMemberId, selfMemberRole],
  )

  const handleSelectRole = useCallback(
    async (member: P2pMember, role: P2pMemberRole) => {
      if (!onUpdateMemberRole || member.role === role) return
      setActionBusy(true)
      setActionError(null)
      try {
        await onUpdateMemberRole(member.id, role)
      } catch (err) {
        setActionError(err instanceof Error ? err.message : '修改角色失败')
      } finally {
        setActionBusy(false)
      }
    },
    [onUpdateMemberRole],
  )

  const handleConfirmRemove = useCallback(async () => {
    if (!removeTarget || !onRemoveMember) return
    setActionBusy(true)
    setActionError(null)
    try {
      await onRemoveMember(removeTarget.id)
      setRemoveTarget(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '移出成员失败')
    } finally {
      setActionBusy(false)
    }
  }, [onRemoveMember, removeTarget])

  if (!open) return null

  return createPortal(
    <>
      <div
        ref={panelRef}
        className="tm-group-members-menu"
        style={{ top: position.top, left: position.left }}
        role="dialog"
        aria-label="群组成员"
      >
        <header className="tm-group-members-menu-header">
          <div>
            <h3 className="tm-group-members-menu-title">群组成员</h3>
            <p className="tm-group-members-menu-subtitle">
              {workspaceName} · {activeMembers.length} 人
            </p>
          </div>
          {canManageMembers && onInvite ? (
            <button
              type="button"
              className="tm-btn tm-btn--secondary tm-group-members-menu-invite"
              onClick={() => {
                onInvite()
                onClose()
              }}
            >
              <IconPlus size={14} />
              邀请成员
            </button>
          ) : null}
        </header>

        {actionError ? <div className="tm-error-bar">{actionError}</div> : null}

        <div className="tm-group-members-menu-body">
          {loading && activeMembers.length === 0 ? (
            <div className="tm-session-empty">加载成员中…</div>
          ) : activeMembers.length === 0 ? (
            <div className="tm-group-members-menu-empty">暂无成员</div>
          ) : (
            <ul className="tm-group-member-list tm-group-members-menu-list">
              {activeMembers.map((member) => {
                const manageable =
                  canManage &&
                  canManageTargetMember(selfMemberRole ?? undefined, member, selfMemberId)

                return (
                  <li
                    key={member.id}
                    className="tm-group-member-card tm-group-member-card--compact"
                    onContextMenu={manageable ? (event) => openManageMenu(event, member) : undefined}
                  >
                    <span className="tm-group-member-avatar" aria-hidden="true">
                      {memberInitial(member.displayName)}
                    </span>
                    <div className="tm-group-member-meta">
                      <span className="tm-group-member-name">
                        {member.displayName}
                        {member.id === selfMemberId ? (
                          <span className="tm-group-member-you">（我）</span>
                        ) : null}
                      </span>
                      <span className="tm-group-member-device" title={member.deviceId}>
                        {shortDeviceId(member.deviceId)}
                      </span>
                    </div>
                    <div className="tm-group-member-end">
                      <span
                        className={[
                          'tm-group-member-role',
                          member.role === 'owner' ? 'tm-group-member-role--owner' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {MEMBER_ROLE_LABELS[member.role]}
                      </span>
                      <div className="tm-group-member-status-row">
                        <span
                          className={[
                            'tm-group-member-status',
                            member.online ? 'tm-group-member-status--online' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={member.online ? '在线' : '离线'}
                        >
                          {member.online
                            ? member.id === selfMemberId
                              ? '本机 · 在线'
                              : member.connectionMode
                                ? `${CONNECTION_MODE_LABELS[member.connectionMode]} · 在线`
                                : '在线'
                            : '离线'}
                        </span>
                        {manageable ? (
                          <button
                            type="button"
                            className="tm-group-member-manage-btn"
                            title="管理成员"
                            disabled={actionBusy}
                            onClick={(event) => openManageMenu(event, member)}
                          >
                            <IconMoreHorizontal size={16} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {contextMenu ? (
        <GroupMemberContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          member={contextMenu.member}
          actorRole={selfMemberRole}
          selfMemberId={selfMemberId}
          busy={actionBusy}
          onClose={() => setContextMenu(null)}
          onSelectRole={(role) => void handleSelectRole(contextMenu.member, role)}
          onRemove={() => setRemoveTarget(contextMenu.member)}
        />
      ) : null}

      {removeTarget ? (
        <ConfirmDialog
          title="移出成员"
          message={`确定将「${removeTarget.displayName}」移出群组？该成员将无法继续访问群组内容。`}
          confirmLabel="移出"
          cancelLabel="取消"
          danger
          onCancel={() => {
            if (!actionBusy) setRemoveTarget(null)
          }}
          onConfirm={() => void handleConfirmRemove()}
        />
      ) : null}
    </>,
    document.body,
  )
}
