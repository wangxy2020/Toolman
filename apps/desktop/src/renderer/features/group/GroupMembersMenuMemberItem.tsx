import type { MouseEvent } from 'react'
import { isSamePerson, resolvePeerMemberDisplayName, type P2pMember, type P2pMemberRole, type PersonSelfRef } from '@toolman/shared'
import { IconMoreHorizontal } from '../../components/icons'
import { getGroupConnectionModeLabel, getGroupMemberRoleLabel } from '../../i18n/group-member-labels'
import type { TranslateFn } from '../../i18n/I18nProvider'
import {
  canManageTargetPerson,
  type GroupedP2pPerson,
} from './group-member-utils'

function memberInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

function deviceKindLabel(kind: P2pMember['deviceKind'], t: TranslateFn): string {
  if (kind === 'mobile') return t('groupPage.members.deviceMobile')
  if (kind === 'web') return t('groupPage.members.deviceWeb')
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
  const manageable =
    canManage && canManageTargetPerson(selfMemberRole ?? undefined, person, self)
  const pending = person.status === 'invited'
  const displayName = isSelf
    ? t('groupPage.messages.mine')
    : resolvePeerMemberDisplayName(person.displayName)
  const avatarInitial = isSelf
    ? t('groupPage.messages.mineInitial')
    : memberInitial(displayName)

  return (
    <li
      className="tm-group-member-card tm-group-member-card--compact"
      onContextMenu={manageable ? (event) => onOpenManageMenu(event, person.primary) : undefined}
    >
      <span className="tm-group-member-avatar" aria-hidden="true">
        {avatarInitial}
      </span>
      <div className="tm-group-member-meta">
        <span className="tm-group-member-name">{displayName}</span>
        <span className="tm-group-member-devices">
          {person.devices.map((device) => (
            <span
              key={device.deviceId}
              className={[
                'tm-group-member-device',
                !pending && device.online ? 'tm-group-member-device--online' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={`${deviceKindLabel(device.deviceKind, t)} · ${device.deviceId} · ${memberStatusLabel(device, pending, t)}`}
            >
              {deviceKindLabel(device.deviceKind, t)}
              {' · '}
              {memberStatusLabel(device, pending, t)}
            </span>
          ))}
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
        {manageable ? (
          <div className="tm-group-member-status-row">
            <button
              type="button"
              className="tm-group-member-manage-btn"
              title={t('groupPage.members.manageMember')}
              disabled={actionBusy}
              onClick={(event) => onOpenManageMenu(event, person.primary)}
            >
              <IconMoreHorizontal size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}
