import { useEffect } from 'react'
import { applyMemberRoster, patchGroupOwnerFromRoster, sameGroupMemberRoster } from '../sync/groupSyncMerge'
import { getMailboxTarget } from '../p2p/mailboxSync'
import { subscribeMeshEvents } from '../p2p/meshEvents'
import type { GroupMember, GroupSharedItem, GroupWorkspace } from '../storage/groupChat'
import type { GroupChatMessage } from '../storage/groupChat'
import type { Dispatch, SetStateAction } from 'react'

type SetByGroup<T> = Dispatch<SetStateAction<Record<string, T[]>>>

export function useGroupChatMesh(args: {
  selfDeviceId: string
  applyLivePresence: (members: GroupMember[], workspaceId: string) => GroupMember[]
  setGroups: Dispatch<SetStateAction<GroupWorkspace[]>>
  setMembersByGroup: SetByGroup<GroupMember>
  setMessagesByGroup: SetByGroup<GroupChatMessage>
  setSharedByGroup: SetByGroup<GroupSharedItem>
}) {
  const {
    selfDeviceId,
    applyLivePresence,
    setGroups,
    setMembersByGroup,
    setMessagesByGroup,
    setSharedByGroup,
  } = args

  useEffect(() => {
    return subscribeMeshEvents((event) => {
      if (event.type === 'roster') {
        setMembersByGroup((prev) => {
          const current = prev[event.workspaceId] ?? []
          const nextMembers = applyLivePresence(
            applyMemberRoster(current, event.members, selfDeviceId),
            event.workspaceId,
          )
          if (sameGroupMemberRoster(current, nextMembers)) return prev
          return { ...prev, [event.workspaceId]: nextMembers }
        })
        if (event.ownerIdentityId || event.ownerDeviceId) {
          setGroups((prev) =>
            patchGroupOwnerFromRoster(prev, event.workspaceId, {
              identityId: event.ownerIdentityId,
              deviceId: event.ownerDeviceId,
            }),
          )
        }
        return
      }
      if (event.type === 'connected' || event.type === 'disconnected' || event.type === 'presence') {
        setMembersByGroup((prev) => {
          const list = prev[event.workspaceId]
          if (!list) return prev
          const mailbox = getMailboxTarget(event.workspaceId)
          const next = list.map((member) => {
            if (member.deviceId === selfDeviceId) return { ...member, online: true }
            if (event.type === 'presence' && member.deviceId === event.deviceId) {
              return { ...member, online: event.online }
            }
            if (event.type === 'connected' && member.deviceId === mailbox?.ownerDeviceId) {
              return { ...member, online: true }
            }
            if (event.type === 'disconnected' && member.deviceId === mailbox?.ownerDeviceId) {
              return { ...member, online: false }
            }
            return member
          })
          if (sameGroupMemberRoster(list, next)) return prev
          return { ...prev, [event.workspaceId]: next }
        })
        return
      }
      if (event.type === 'chat') {
        setMessagesByGroup((prev) => {
          const list = prev[event.workspaceId] ?? []
          if (list.some((item) => item.id === event.message.id)) return prev
          return { ...prev, [event.workspaceId]: [...list, event.message] }
        })
        return
      }
      if (event.type === 'chat-delete') {
        setMessagesByGroup((prev) => ({
          ...prev,
          [event.workspaceId]: (prev[event.workspaceId] ?? []).filter(
            (item) => item.id !== event.messageId,
          ),
        }))
        return
      }
      if (event.type === 'chat-clear') {
        setMessagesByGroup((prev) => ({ ...prev, [event.workspaceId]: [] }))
        return
      }
      if (event.type === 'shared') {
        setSharedByGroup((prev) => {
          const list = prev[event.workspaceId] ?? []
          const index = list.findIndex(
            (item) => item.id === event.item.id && item.kind === event.item.kind,
          )
          if (index < 0) {
            return { ...prev, [event.workspaceId]: [event.item, ...list] }
          }
          const next = [...list]
          const previous = next[index]
          next[index] = {
            ...previous,
            ...event.item,
            name:
              event.item.name.trim() && event.item.name !== '共享智能体'
                ? event.item.name
                : previous.name || event.item.name,
            parentName: event.item.parentName ?? previous.parentName,
            sessionPermission: event.item.sessionPermission ?? previous.sessionPermission,
            sharedBy: event.item.sharedBy ?? previous.sharedBy,
            sourceAssistantId: event.item.sourceAssistantId ?? previous.sourceAssistantId,
            referencedModelId: event.item.referencedModelId ?? previous.referencedModelId,
            ownerDeviceId: event.item.ownerDeviceId ?? previous.ownerDeviceId,
          }
          return { ...prev, [event.workspaceId]: next }
        })
        return
      }
      if (event.type === 'shared-remove') {
        setSharedByGroup((prev) => ({
          ...prev,
          [event.workspaceId]: (prev[event.workspaceId] ?? []).filter((item) => {
            if (item.kind !== event.kind) return true
            if (item.id === event.id) return false
            return !(event.cascadeChildren && item.parentId === event.id)
          }),
        }))
        return
      }
      if (event.type === 'shared-prune-children') {
        const keep = new Set(event.keepIds)
        setSharedByGroup((prev) => ({
          ...prev,
          [event.workspaceId]: (prev[event.workspaceId] ?? []).filter((item) => {
            if (item.kind !== event.kind || item.parentId !== event.parentId) return true
            return keep.has(item.id)
          }),
        }))
      }
    })
  }, [applyLivePresence, selfDeviceId, setGroups, setMembersByGroup, setMessagesByGroup, setSharedByGroup])
}
