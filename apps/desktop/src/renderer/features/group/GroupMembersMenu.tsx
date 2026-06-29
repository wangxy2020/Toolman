import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { P2pMember, P2pMemberRole } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { GroupMemberContextMenu } from './GroupMemberContextMenu'
import { canManageTargetMember } from './group-member-utils'
import { GroupMembersMenuMemberItem } from './GroupMembersMenuMemberItem'

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
  const { t } = useI18n()
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
        setActionError(err instanceof Error ? err.message : t('groupPage.members.roleChangeFailed'))
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
      setActionError(err instanceof Error ? err.message : t('groupPage.members.removeFailed'))
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
        aria-label={t('groupPage.members.aria')}
      >
        <header className="tm-group-members-menu-header">
          <div>
            <h3 className="tm-group-members-menu-title">{t('groupPage.members.title')}</h3>
            <p className="tm-group-members-menu-subtitle">
              {t('groupPage.members.subtitle', { name: workspaceName, count: activeMembers.length })}
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
              {t('groupPage.members.invite')}
            </button>
          ) : null}
        </header>

        {actionError ? <div className="tm-error-bar">{actionError}</div> : null}

        <div className="tm-group-members-menu-body">
          {loading && activeMembers.length === 0 ? (
            <div className="tm-session-empty">{t('groupPage.members.loading')}</div>
          ) : activeMembers.length === 0 ? (
            <div className="tm-group-members-menu-empty">{t('groupPage.members.empty')}</div>
          ) : (
            <ul className="tm-group-member-list tm-group-members-menu-list">
              {activeMembers.map((member) => {
                return (
                  <GroupMembersMenuMemberItem
                    key={member.id}
                    member={member}
                    selfMemberId={selfMemberId}
                    selfMemberRole={selfMemberRole}
                    canManage={canManage}
                    actionBusy={actionBusy}
                    t={t}
                    onOpenManageMenu={openManageMenu}
                  />
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
          title={t('groupPage.members.removeTitle')}
          message={t('groupPage.members.removeMessage', { name: removeTarget.displayName })}
          confirmLabel={t('groupPage.members.removeConfirm')}
          cancelLabel={t('communityPage.publish.cancel')}
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
