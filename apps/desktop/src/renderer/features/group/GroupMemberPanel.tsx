import { useState } from 'react'
import type { P2pConnectionMode, P2pMember, P2pMemberRole } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconMoreHorizontal, IconPlus, IconUsers } from '../../components/icons'
import { GroupMemberContextMenu } from './GroupMemberContextMenu'
import { canManageTargetMember, MEMBER_ROLE_LABELS } from './group-member-utils'

const CONNECTION_MODE_LABELS: Record<P2pConnectionMode, string> = {
  lan: '局域网',
  wan: '广域网',
}

interface Props {
  workspaceName: string
  members: P2pMember[]
  selfMemberId: string | null
  selfMemberRole: P2pMemberRole | null
  canManageMembers: boolean
  loading?: boolean
  error?: string | null
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

export function GroupMemberPanel({
  workspaceName,
  members,
  selfMemberId,
  selfMemberRole,
  canManageMembers,
  loading,
  error,
  onInvite,
  onRemoveMember,
  onUpdateMemberRole,
}: Props) {
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    member: P2pMember
  } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<P2pMember | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const activeMembers = members.filter((member) => member.status === 'active')
  const canManage = Boolean(onRemoveMember && onUpdateMemberRole)

  const openManageMenu = (event: React.MouseEvent, member: P2pMember) => {
    event.preventDefault()
    event.stopPropagation()
    if (!canManageTargetMember(selfMemberRole ?? undefined, member, selfMemberId)) return
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      member,
    })
  }

  const handleSelectRole = async (member: P2pMember, role: P2pMemberRole) => {
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
  }

  const handleConfirmRemove = async () => {
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
  }

  return (
    <div className="tm-group-member-panel">
      <div className="tm-group-member-panel-header">
        <div>
          <h2 className="tm-group-member-panel-title">群组成员</h2>
          <p className="tm-group-member-panel-subtitle">
            {workspaceName} · {activeMembers.length} 人
          </p>
        </div>
        {canManageMembers && onInvite && (
          <button type="button" className="tm-btn tm-btn--secondary" onClick={onInvite}>
            <IconPlus size={14} />
            邀请成员
          </button>
        )}
      </div>

      {(error || actionError) && (
        <div className="tm-error-bar">{actionError ?? error}</div>
      )}

      {loading && members.length === 0 ? (
        <div className="tm-session-empty">加载成员中…</div>
      ) : activeMembers.length === 0 ? (
        <div className="tm-group-member-panel-empty">
          <span className="tm-group-member-panel-empty-icon" aria-hidden="true">
            <IconUsers size={28} />
          </span>
          <p>暂无成员</p>
          {canManageMembers && onInvite && (
            <button type="button" className="tm-btn tm-btn--primary" onClick={onInvite}>
              邀请第一位成员
            </button>
          )}
        </div>
      ) : (
        <ul className="tm-group-member-list">
          {activeMembers.map((member) => {
            const manageable =
              canManage &&
              canManageTargetMember(selfMemberRole ?? undefined, member, selfMemberId)

            return (
              <li
                key={member.id}
                className="tm-group-member-card"
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
    </div>
  )
}
