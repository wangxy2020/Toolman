import {
  groupVisibleMembersByPerson as groupVisibleMembersByIdentity,
  isSamePerson,
} from '@toolman/shared'
import type { GroupActivity, GroupMember, GroupMemberRole, GroupSharedKind } from '../storage/groupChat'

export function activeGroupMembers(members: GroupMember[]): GroupMember[] {
  return members.filter((member) => member.status === 'active')
}

export function visibleGroupMembers(members: GroupMember[]): GroupMember[] {
  return members.filter((member) => member.status === 'active' || member.status === 'invited')
}

export type GroupedGroupMember = {
  key: string
  identityId?: string
  displayName: string
  role: GroupMemberRole
  devices: GroupMember[]
  online: boolean
  status: 'active' | 'invited'
}

export function groupVisibleMembersByPerson(
  members: GroupMember[],
  owner?: { identityId?: string | null; deviceId?: string | null },
): GroupedGroupMember[] {
  return groupVisibleMembersByIdentity(visibleGroupMembers(members), owner).map((person) => ({
    key: person.identityId,
    identityId: person.primary.identityId,
    displayName: person.displayName,
    role: (person.role ?? person.primary.role) as GroupMemberRole,
    devices: person.devices,
    online: person.online,
    status: person.status,
  }))
}

export function isSelfGroupMember(
  member: Pick<GroupMember, 'id' | 'identityId' | 'deviceId'>,
  self: { identityId?: string | null; deviceId?: string | null },
): boolean {
  return isSamePerson(member, self)
}

export function deviceKindLabel(kind: GroupMember['deviceKind']): string {
  return kind === 'mobile' ? '手机' : kind === 'desktop' ? '电脑' : '设备'
}

export function memberAvatarInitial(displayName: string): string {
  return (displayName.trim().slice(0, 1) || '?').toUpperCase()
}

export function memberOnlineLabel(online: boolean): string {
  return online ? '在线' : '离线'
}

export function memberDeviceLine(
  kind: GroupMember['deviceKind'],
  deviceId: string,
  shortId: (id: string) => string,
): string {
  return `${deviceKindLabel(kind)} ${shortId(deviceId)}`
}

export function groupSharedPickerHint(kind: GroupSharedKind): string {
  if (kind === 'notes') {
    return '展开笔记本可查看笔记，勾选笔记本将全选其中笔记，也可单独勾选笔记。'
  }
  if (kind === 'knowledge') {
    return '展开知识库可查看未共享文档，勾选知识库将全选可添加文件，也可单独勾选文档。'
  }
  if (kind === 'agents') {
    return '展开智能体可查看未共享话题，勾选智能体或话题将添加到群组。'
  }
  return '勾选要添加到群组的工作流。'
}

export function sortGroupActivities(events: GroupActivity[]): GroupActivity[] {
  return [...events].sort((a, b) => b.timestamp - a.timestamp || b.seq - a.seq)
}
