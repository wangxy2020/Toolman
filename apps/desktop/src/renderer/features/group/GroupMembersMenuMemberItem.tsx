import type { MouseEvent } from 'react'
import { isSamePerson, type P2pMember, type P2pMemberRole, type PersonSelfRef } from '@toolman/shared'
import { IconMoreHorizontal } from '../../components/icons'
import { getGroupConnectionModeLabel, getGroupMemberRoleLabel } from '../../i18n/group-member-labels'
import type { TranslateFn } from '../../i18n/I18nProvider'
import {
  canManageTargetMember,
  selectCurrentMemberDevice,
  type GroupedP2pPerson,
} from './group-member-utils'

function shortDeviceId(deviceId: string): string {
  if (deviceId.length <= 16) return deviceId
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`
}

function memberInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

function deviceKindLabel(kind: P2pMember['deviceKind'], t: TranslateFn): string {
  if (kind === 'mobile') return t('groupPage.members.deviceMobile')
  if (kind === 'desktop') return t('groupPage.members.deviceDesktop')
  return t('groupPage.members.deviceUnknown')
}

function memberStatusLabel(member: P2pMember, pending: boolean, t: TranslateFn): string {
  if (pending) return t('groupPage.members.pendingJoin')
  if (!member.online) return t('groupPage.members.offline')
  if (member.connectionMode) {
    return t('groupPage.members.connectionOnline', {
      mode: getGroupConnectionModeLabel(member.connectionMode, t),
    })
  }
  return t('groupPage.members.online')
}

interface Props {
  person: GroupedP2pPerson
  self: PersonSelfRef
  selfMemberRole: P2pMemberRole | null
  canManage: boolean
  actionBusy: boolean
  t: TranslateFn
  onOpenManageMenu: (event: MouseEvent, member: P2pMember) => void
}

export function GroupMembersMenuMemberItem({
  person,
  self,
  selfMemberRole,
  canManage,
  actionBusy,
  t,
  onOpenManageMenu,
}: Props) {
  const isSelf = person.devices.some((device) => isSamePerson(device, self))
  const current = selectCurrentMemberDevice(person, self)
  const manageable =
    canManage && canManageTargetMember(selfMemberRole ?? undefined, person.primary, self)
  const pending = person.status === 'invited'

  return (
    <li
      className="tm-group-member-card tm-group-member-card--compact"
      onContextMenu={manageable ? (event) => onOpenManageMenu(event, person.primary) : undefined}
    >
      <span className="tm-group-member-avatar" aria-hidden="true">
        {memberInitial(person.displayName)}
      </span>
      <div className="tm-group-member-meta">
        <span className="tm-group-member-name">
          {person.displayName}
          {isSelf ? <span className="tm-group-member-you">{t('groupPage.members.you')}</span> : null}
        </span>
        <span className="tm-group-member-device" title={current.deviceId}>
          {deviceKindLabel(current.deviceKind, t)} {shortDeviceId(current.deviceId)}
        </span>
      </div>
      <div className="tm-group-member-end">
        <span
          className={[
            'tm-group-member-role',
            person.role === 'owner' ? 'tm-group-member-role--owner' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {getGroupMemberRoleLabel(person.role, t)}
        </span>
        <div className="tm-group-member-status-row">
          <span
            className={[
              'tm-group-member-status',
              !pending && current.online ? 'tm-group-member-status--online' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={memberStatusLabel(current, pending, t)}
          >
            {memberStatusLabel(current, pending, t)}
          </span>
          {manageable ? (
            <button
              type="button"
              className="tm-group-member-manage-btn"
              title={t('groupPage.members.manageMember')}
              disabled={actionBusy}
              onClick={(event) => onOpenManageMenu(event, person.primary)}
            >
              <IconMoreHorizontal size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}
