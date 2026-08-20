import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { isInviteExpired } from '@toolman/shared'
import { applyPendingInvite } from '../p2p/applyInvite'
import { applyMemberRoster } from '../sync/groupSyncMerge'
import { pendingInviteFromInput, type PendingP2pInvite } from '../p2p/inviteParse'
import { completeInviteWebRtcJoin } from '../p2p/completeInviteWebRtc'
import { registerPendingInviteOnDesktop } from '../p2p/registerInviteOnDesktop'
import type { GroupActivity, GroupInvite, GroupMember, GroupWorkspace } from '../storage/groupChat'
import { DEFAULT_GROUP_ACTION, type GroupSidebarAction } from './groupSidebar'
import type { GroupChatSelf } from './groupChatContext.types'

type SetByGroup<T> = Dispatch<SetStateAction<Record<string, T[]>>>

interface InviteDeps {
  self: GroupChatSelf
  groups: GroupWorkspace[]
  membersByGroup: Record<string, GroupMember[]>
  invitesByGroup: Record<string, GroupInvite>
  activitiesByGroup: Record<string, GroupActivity[]>
  activeGroupId: string | null
  setGroups: Dispatch<SetStateAction<GroupWorkspace[]>>
  setMembersByGroup: SetByGroup<GroupMember>
  setInvitesByGroup: Dispatch<SetStateAction<Record<string, GroupInvite>>>
  setActiveGroupId: Dispatch<SetStateAction<string | null>>
  setActiveAction: Dispatch<SetStateAction<GroupSidebarAction>>
  setExpanded: Dispatch<SetStateAction<Set<string>>>
  setMessagesByGroup: SetByGroup<import('../storage/groupChat').GroupChatMessage>
  setSharedByGroup: SetByGroup<import('../storage/groupChat').GroupSharedItem>
  appendActivity: (groupId: string, message: string, resourceLabel: string, sourceDeviceId?: string) => void
  applyLivePresence: (members: GroupMember[], workspaceId: string) => GroupMember[]
}

export function useGroupChatInvites({
  self,
  groups,
  membersByGroup,
  invitesByGroup,
  activitiesByGroup,
  activeGroupId,
  setGroups,
  setMembersByGroup,
  setInvitesByGroup,
  setActiveGroupId,
  setActiveAction,
  setExpanded,
  setMessagesByGroup,
  setSharedByGroup,
  appendActivity,
  applyLivePresence,
}: InviteDeps) {
  const { selfIdentityId, selfDeviceId, selfName } = self

  const applyInvites = useCallback(
    (invites: PendingP2pInvite[]) => {
      if (invites.length === 0) return
      const selfInfo = {
        identityId: selfIdentityId,
        deviceId: selfDeviceId,
        displayName: selfName,
      }
      let nextGroups = groups
      let nextMembers = membersByGroup
      let nextInvites = invitesByGroup
      let activeId = activeGroupId
      const opened = new Set<string>()
      for (const invite of invites) {
        if (isInviteExpired(invite.expiresAt)) continue
        const applied = applyPendingInvite({
          groups: nextGroups,
          membersByGroup: nextMembers,
          invitesByGroup: nextInvites,
          invite,
          self: selfInfo,
        })
        nextGroups = applied.groups
        nextMembers = applied.membersByGroup
        nextInvites = applied.invitesByGroup
        activeId = applied.activeGroupId
        opened.add(applied.activeGroupId)
      }
      setGroups(nextGroups)
      setMembersByGroup(nextMembers)
      setInvitesByGroup(nextInvites)
      if (activeId) {
        setActiveGroupId(activeId)
        setActiveAction(DEFAULT_GROUP_ACTION)
      }
      setExpanded((prev) => {
        const next = new Set(prev)
        for (const id of opened) next.add(id)
        return next
      })
      setMessagesByGroup((prev) => {
        const next = { ...prev }
        for (const id of opened) next[id] = next[id] ?? []
        return next
      })
      setSharedByGroup((prev) => {
        const next = { ...prev }
        for (const id of opened) next[id] = next[id] ?? []
        return next
      })
      for (const id of opened) {
        const name = nextGroups.find((group) => group.id === id)?.name ?? '群组'
        if ((activitiesByGroup[id] ?? []).length === 0) {
          appendActivity(id, `已用邀请加入「${name}」`, '群组', selfDeviceId)
        }
      }
      for (const invite of invites) {
        if (isInviteExpired(invite.expiresAt)) continue
        const groupId = invite.workspaceId?.trim()
        void registerPendingInviteOnDesktop({
          invite,
          self: {
            identityId: selfIdentityId,
            deviceId: selfDeviceId,
            displayName: selfName,
          },
        }).then((result) => {
          const id = groupId || activeId
          if (!id) return
          if (result.ok) {
            setMembersByGroup((prev) => {
              const list = prev[id] ?? []
              const roster = result.data.members
              if (roster && roster.length > 0) {
                return {
                  ...prev,
                  [id]: applyLivePresence(
                    applyMemberRoster(
                      list,
                      roster.map((member) => ({
                        id: member.id,
                        displayName: member.displayName,
                        role: member.role,
                        deviceId: member.deviceId,
                        identityId: member.identityId,
                        deviceKind: member.deviceKind,
                        status: member.status,
                      })),
                      selfDeviceId,
                    ),
                    id,
                  ),
                }
              }
              return {
                ...prev,
                [id]: list.map((member) =>
                  member.deviceId === selfDeviceId
                    ? {
                        ...member,
                        id: result.data.member.id,
                        identityId: result.data.member.identityId,
                        displayName: member.displayName,
                        status: result.data.member.status,
                        role:
                          result.data.member.role === 'owner' &&
                          result.data.member.identityId !== result.data.ownerIdentityId
                            ? 'member'
                            : result.data.member.role,
                      }
                    : member,
                ),
              }
            })
            if (result.data.ownerIdentityId || result.data.ownerDeviceId) {
              setGroups((prev) =>
                prev.map((group) =>
                  group.id === id
                    ? {
                        ...group,
                        ownerIdentityId: result.data.ownerIdentityId ?? group.ownerIdentityId,
                        ownerDeviceId: result.data.ownerDeviceId ?? group.ownerDeviceId,
                      }
                    : group,
                ),
              )
            }
            appendActivity(
              id,
              result.data.member.status === 'active'
                ? '已加入群组，正在同步消息'
                : '已向群主电脑登记，等待对方确认',
              '群组',
              selfDeviceId,
            )
            void completeInviteWebRtcJoin({
              invite,
              register: result.data,
              hubUrl: result.hubUrl,
              self: {
                identityId: selfIdentityId,
                deviceId: selfDeviceId,
                displayName: selfName,
              },
            }).then((webrtc) => {
              if (webrtc.ok) {
                appendActivity(id, '已与群主电脑建立直连', '群组', selfDeviceId)
                return
              }
              if (webrtc.skipped) {
                if (webrtc.reason === 'no-offer') {
                  appendActivity(id, webrtc.message, '群组', selfDeviceId)
                }
                return
              }
              appendActivity(id, `直连失败：${webrtc.message}`, '群组', selfDeviceId)
            })
            return
          }
          appendActivity(id, `登记群主电脑失败：${result.message}`, '群组', selfDeviceId)
        })
      }
    },
    [
      activeGroupId,
      activitiesByGroup,
      appendActivity,
      applyLivePresence,
      groups,
      invitesByGroup,
      membersByGroup,
      selfDeviceId,
      selfIdentityId,
      selfName,
      setActiveAction,
      setActiveGroupId,
      setExpanded,
      setGroups,
      setInvitesByGroup,
      setMembersByGroup,
      setMessagesByGroup,
      setSharedByGroup,
    ],
  )

  const createOrReuseInvite = useCallback((): GroupInvite | null => {
    if (!activeGroupId) return null
    const existing = invitesByGroup[activeGroupId]
    if (existing && existing.expiresAt > Date.now()) return existing
    const token = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const group = groups.find((item) => item.id === activeGroupId)
    const url = new URL('toolman://join')
    url.searchParams.set('token', token)
    url.searchParams.set('wid', activeGroupId)
    if (group?.name) url.searchParams.set('name', group.name)
    const invite: GroupInvite = {
      token,
      url: url.toString(),
      expiresAt: Date.now() + 72 * 60 * 60 * 1000,
    }
    setInvitesByGroup((prev) => ({ ...prev, [activeGroupId]: invite }))
    return invite
  }, [activeGroupId, groups, invitesByGroup, setInvitesByGroup])

  const joinGroupByInvite = useCallback(
    (input: string): { ok: true } | { ok: false; message: string } => {
      const invite = pendingInviteFromInput(input)
      if (!invite) return { ok: false, message: '无法解析邀请链接或邀请码' }
      if (isInviteExpired(invite.expiresAt)) return { ok: false, message: '邀请码已过期' }
      applyInvites([invite])
      return { ok: true }
    },
    [applyInvites],
  )

  return { applyInvites, createOrReuseInvite, joinGroupByInvite }
}
