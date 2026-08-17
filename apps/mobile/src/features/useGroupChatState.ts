import { useCallback, useEffect, useState } from 'react'
import { isPlaceholderMemberName, isSamePerson } from '@toolman/shared'
import {
  saveGroupChatStore,
  type GroupActivity,
  type GroupChatMessage,
  type GroupInvite,
  type GroupMember,
  type GroupSharedItem,
  type GroupWorkspace,
} from '../storage/groupChat'
import { getCurrentDataIdentity } from '../storage/identityScopeCore'
import { setGroupSyncLocalReader } from '../sync/groupSyncBridge'
import { localP2pClientDeviceKind } from '../p2p/deviceKind'
import { DEFAULT_GROUP_ACTION, type GroupSidebarAction } from './groupSidebar'
import { newId } from './groupPaneUtils'
import type { GroupChatSelf } from './groupChatContext.types'

export function useGroupChatState(self: GroupChatSelf, authIdentityId: string | null | undefined) {
  const { selfIdentityId, selfDeviceId, selfMemberId, selfName } = self
  const [ready, setReady] = useState(false)
  const [groups, setGroups] = useState<GroupWorkspace[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [messagesByGroup, setMessagesByGroup] = useState<Record<string, GroupChatMessage[]>>({})
  const [membersByGroup, setMembersByGroup] = useState<Record<string, GroupMember[]>>({})
  const [sharedByGroup, setSharedByGroup] = useState<Record<string, GroupSharedItem[]>>({})
  const [activitiesByGroup, setActivitiesByGroup] = useState<Record<string, GroupActivity[]>>({})
  const [invitesByGroup, setInvitesByGroup] = useState<Record<string, GroupInvite>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<GroupSidebarAction>(DEFAULT_GROUP_ACTION)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!ready) return
    setGroupSyncLocalReader(() => ({ groups, membersByGroup }))
  }, [ready, groups, membersByGroup])

  useEffect(() => {
    if (!ready) return
    if (getCurrentDataIdentity() !== (authIdentityId ?? null)) return
    void saveGroupChatStore({
      groups,
      activeGroupId,
      messagesByGroup,
      membersByGroup,
      sharedByGroup,
      activitiesByGroup,
      invitesByGroup,
    })
  }, [
    ready,
    groups,
    activeGroupId,
    messagesByGroup,
    membersByGroup,
    sharedByGroup,
    activitiesByGroup,
    invitesByGroup,
    authIdentityId,
  ])

  useEffect(() => {
    const name = selfName.trim()
    if (!ready || !name || isPlaceholderMemberName(name)) return
    setMembersByGroup((prev) => {
      let changed = false
      const next: Record<string, GroupMember[]> = {}
      for (const [groupId, members] of Object.entries(prev)) {
        next[groupId] = members.map((member) => {
          if (
            !isSamePerson(member, { identityId: selfIdentityId, deviceId: selfDeviceId }) ||
            member.displayName === name
          ) {
            return member
          }
          changed = true
          return { ...member, displayName: name }
        })
      }
      return changed ? next : prev
    })
  }, [ready, selfDeviceId, selfIdentityId, selfName])

  const appendActivity = useCallback(
    (groupId: string, message: string, resourceLabel: string, sourceDeviceId?: string) => {
      setActivitiesByGroup((prev) => {
        const list = prev[groupId] ?? []
        const seq = list.reduce((max, event) => Math.max(max, event.seq), 0) + 1
        return {
          ...prev,
          [groupId]: [
            ...list,
            {
              id: newId('evt'),
              seq,
              timestamp: Date.now(),
              message,
              resourceLabel,
              sourceDeviceId,
            },
          ],
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (!ready) return
    setMembersByGroup((prev) => {
      let changed = false
      const next = { ...prev }
      for (const group of groups) {
        if ((next[group.id] ?? []).length > 0) continue
        if (group.origin === 'desktop') continue
        next[group.id] = [
          {
            id: selfDeviceId,
            displayName: selfName,
            role: 'owner',
            deviceId: selfDeviceId,
            identityId: selfIdentityId,
            deviceKind: localP2pClientDeviceKind(),
            online: true,
            status: 'active',
          },
        ]
        changed = true
      }
      return changed ? next : prev
    })
    setActivitiesByGroup((prev) => {
      let changed = false
      const next = { ...prev }
      for (const group of groups) {
        if ((next[group.id] ?? []).length > 0) continue
        next[group.id] = [
          {
            id: newId('evt'),
            seq: 1,
            timestamp: group.createdAt,
            message:
              group.origin === 'desktop'
                ? `已从电脑同步群组「${group.name}」`
                : `创建了群组「${group.name}」`,
            resourceLabel: '群组',
            sourceDeviceId: selfMemberId,
          },
        ]
        changed = true
      }
      return changed ? next : prev
    })
  }, [groups, ready, selfDeviceId, selfIdentityId, selfMemberId, selfName])

  const createGroup = useCallback(() => {
    const group: GroupWorkspace = {
      id: newId('group'),
      name: `群组 ${groups.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      origin: 'local',
    }
    setGroups((prev) => [group, ...prev])
    setActiveGroupId(group.id)
    setActiveAction(DEFAULT_GROUP_ACTION)
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(group.id)
      return next
    })
    setMessagesByGroup((prev) => ({ ...prev, [group.id]: prev[group.id] ?? [] }))
    setMembersByGroup((prev) => ({
      ...prev,
      [group.id]: [
        {
          id: selfDeviceId,
          displayName: selfName,
          role: 'owner',
          deviceId: selfDeviceId,
          identityId: selfIdentityId,
          deviceKind: localP2pClientDeviceKind(),
          online: true,
          status: 'active',
        },
      ],
    }))
    setSharedByGroup((prev) => ({ ...prev, [group.id]: [] }))
    setActivitiesByGroup((prev) => ({
      ...prev,
      [group.id]: [
        {
          id: newId('evt'),
          seq: 1,
          timestamp: group.createdAt,
          message: `创建了群组「${group.name}」`,
          resourceLabel: '群组',
          sourceDeviceId: selfMemberId,
        },
      ],
    }))
  }, [groups.length, selfDeviceId, selfIdentityId, selfMemberId, selfName])

  const selectGroup = useCallback((id: string) => {
    setActiveGroupId(id)
    setActiveAction(DEFAULT_GROUP_ACTION)
    setExpanded((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const selectGroupAction = useCallback((groupId: string, action: GroupSidebarAction) => {
    setActiveGroupId(groupId)
    setActiveAction(action)
    setExpanded((prev) => {
      if (prev.has(groupId)) return prev
      const next = new Set(prev)
      next.add(groupId)
      return next
    })
  }, [])

  const toggleExpanded = useCallback((groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const updateGroup = useCallback((id: string, patch: { name: string; description?: string }) => {
    setGroups((prev) =>
      prev.map((group) =>
        group.id === id
          ? { ...group, name: patch.name, description: patch.description, updatedAt: Date.now() }
          : group,
      ),
    )
    setSettingsOpen(false)
    appendActivity(id, `更新了群组信息「${patch.name}」`, '群组', selfMemberId)
  }, [appendActivity, selfMemberId])

  const dissolveGroup = useCallback((id: string) => {
    setGroups((prev) => prev.filter((group) => group.id !== id))
    setMessagesByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setMembersByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSharedByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setActivitiesByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setInvitesByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setActiveGroupId((current) => {
      if (current !== id) return current
      const remaining = groups.filter((group) => group.id !== id)
      return remaining[0]?.id ?? null
    })
    setSettingsOpen(false)
  }, [groups])

  return {
    ready,
    setReady,
    groups,
    setGroups,
    activeGroupId,
    setActiveGroupId,
    messagesByGroup,
    setMessagesByGroup,
    membersByGroup,
    setMembersByGroup,
    sharedByGroup,
    setSharedByGroup,
    activitiesByGroup,
    setActivitiesByGroup,
    invitesByGroup,
    setInvitesByGroup,
    settingsOpen,
    setSettingsOpen,
    activeAction,
    setActiveAction,
    expanded,
    setExpanded,
    appendActivity,
    createGroup,
    selectGroup,
    selectGroupAction,
    toggleExpanded,
    updateGroup,
    dissolveGroup,
  }
}
