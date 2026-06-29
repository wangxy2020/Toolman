import type { MouseEvent } from 'react'
import type { P2pMember, P2pMemberRole } from '@toolman/shared'
import { IconMoreHorizontal } from '../../components/icons'
import { getGroupConnectionModeLabel, getGroupMemberRoleLabel } from '../../i18n/group-member-labels'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { canManageTargetMember } from './group-member-utils'

function shortDeviceId(deviceId: string): string {
  if (deviceId.length <= 16) return deviceId
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`
}

function memberInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

interface Props {
  member: P2pMember
  selfMemberId: string | null
  selfMemberRole: P2pMemberRole | null
  canManage: boolean
  actionBusy: boolean
  t: TranslateFn
  onOpenManageMenu: (event: MouseEvent, member: P2pMember) => void
}

export function GroupMembersMenuMemberItem({
  member,
  selfMemberId,
  selfMemberRole,
  canManage,
  actionBusy,
  t,
  onOpenManageMenu,
}: Props) {
  const manageable = canManage && canManageTargetMember(selfMemberRole ?? undefined, member, selfMemberId)

  return (
    <li
      className="tm-group-member-card tm-group-member-card--compact"
      onContextMenu={manageable ? (event) => onOpenManageMenu(event, member) : undefined}
    >
      <span className="tm-group-member-avatar" aria-hidden="true">
        {memberInitial(member.displayName)}
      </span>
      <div className="tm-group-member-meta">
        <span className="tm-group-member-name">
          {member.displayName}
          {member.id === selfMemberId ? (
            <span className="tm-group-member-you">{t('groupPage.members.you')}</span>
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
          {getGroupMemberRoleLabel(member.role, t)}
        </span>
        <div className="tm-group-member-status-row">
          <span
            className={['tm-group-member-status', member.online ? 'tm-group-member-status--online' : '']
              .filter(Boolean)
              .join(' ')}
            title={member.online ? t('groupPage.members.online') : t('groupPage.members.offline')}
          >
            {member.online
              ? member.id === selfMemberId
                ? t('groupPage.members.localOnline')
                : member.connectionMode
                  ? t('groupPage.members.connectionOnline', {
                      mode: getGroupConnectionModeLabel(member.connectionMode, t),
                    })
                  : t('groupPage.members.online')
              : t('groupPage.members.offline')}
          </span>
          {manageable ? (
            <button
              type="button"
              className="tm-group-member-manage-btn"
              title={t('groupPage.members.manageMember')}
              disabled={actionBusy}
              onClick={(event) => onOpenManageMenu(event, member)}
            >
              <IconMoreHorizontal size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}
