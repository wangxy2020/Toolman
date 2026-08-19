import { useCallback } from 'react'
import { findSelfWorkspaceMember, isSamePerson } from '@toolman/shared'
import { proposeWorkspaceEvent } from '../p2p/sharePropose'
import { groupMemberRoleLabel, type GroupMember, type GroupMemberRole } from '../storage/groupChat'
import type { GroupChatSelf } from './groupChatContext.types'
import type { useGroupChatState } from './useGroupChatState'

type Store = ReturnType<typeof useGroupChatState>

function personDeviceIds(members: GroupMember[], target: GroupMember): Set<string> {
  return new Set(
    members
      .filter((member) =>
        isSamePerson(member, {
          memberId: target.id,
          identityId: target.identityId,
          deviceId: target.deviceId,
        }),
      )
      .map((member) => member.id),
  )
}

export function useGroupChatMembers(self: GroupChatSelf, store: Store) {
  const { selfIdentityId, selfDeviceId, selfMemberId } = self
  const {
    activeGroupId,
    groups,
    membersByGroup,
    setMembersByGroup,
    appendActivity,
  } = store

  const operatorIdFor = useCallback(
    (members: GroupMember[]) =>
      findSelfWorkspaceMember(members, {
        identityId: selfIdentityId,
        deviceId: selfDeviceId,
      })?.id ?? selfMemberId,
    [selfDeviceId, selfIdentityId, selfMemberId],
  )

  const removeMember = useCallback(
    async (memberId: string) => {
      const groupId = activeGroupId
      if (!groupId) throw new Error('群组不存在')
      const members = membersByGroup[groupId] ?? []
      const target = members.find((member) => member.id === memberId)
      if (!target) throw new Error('成员不存在')
      const group = groups.find((item) => item.id === groupId)
      const ids = personDeviceIds(members, target)
      const snapshot = members
      setMembersByGroup((prev) => ({
        ...prev,
        [groupId]: (prev[groupId] ?? []).filter((member) => !ids.has(member.id)),
      }))
      if (group?.origin === 'desktop') {
        const result = await proposeWorkspaceEvent({
          workspaceId: groupId,
          resourceType: 'Member',
          resourceId: memberId,
          operatorId: operatorIdFor(members),
          eventType: 'Left',
          payload: {
            member_id: memberId,
            reason: 'removed',
            display_name: target.displayName,
            device_id: target.deviceId,
            identity_id: target.identityId,
          },
          sourceDeviceId: selfDeviceId,
        })
        if (!result.ok) {
          setMembersByGroup((prev) => ({ ...prev, [groupId]: snapshot }))
          throw new Error(result.message)
        }
      }
      appendActivity(groupId, `将「${target.displayName}」移出群组`, '成员', selfMemberId)
    },
    [
      activeGroupId,
      appendActivity,
      groups,
      membersByGroup,
      operatorIdFor,
      selfDeviceId,
      selfMemberId,
      setMembersByGroup,
    ],
  )

  const updateMemberRole = useCallback(
    async (memberId: string, role: GroupMemberRole) => {
      const groupId = activeGroupId
      if (!groupId) throw new Error('群组不存在')
      if (role === 'owner') throw new Error('不能将成员设为群主')
      const members = membersByGroup[groupId] ?? []
      const target = members.find((member) => member.id === memberId)
      if (!target) throw new Error('成员不存在')
      const group = groups.find((item) => item.id === groupId)
      const ids = personDeviceIds(members, target)
      const snapshot = members
      setMembersByGroup((prev) => ({
        ...prev,
        [groupId]: (prev[groupId] ?? []).map((member) =>
          ids.has(member.id) ? { ...member, role } : member,
        ),
      }))
      if (group?.origin === 'desktop') {
        const result = await proposeWorkspaceEvent({
          workspaceId: groupId,
          resourceType: 'Member',
          resourceId: memberId,
          operatorId: operatorIdFor(members),
          eventType: 'Updated',
          payload: {
            member_id: memberId,
            role,
          },
          sourceDeviceId: selfDeviceId,
        })
        if (!result.ok) {
          setMembersByGroup((prev) => ({ ...prev, [groupId]: snapshot }))
          throw new Error(result.message)
        }
      }
      appendActivity(
        groupId,
        `将「${target.displayName}」设为${groupMemberRoleLabel(role)}`,
        '成员',
        selfMemberId,
      )
    },
    [
      activeGroupId,
      appendActivity,
      groups,
      membersByGroup,
      operatorIdFor,
      selfDeviceId,
      selfMemberId,
      setMembersByGroup,
    ],
  )

  return { removeMember, updateMemberRole }
}
